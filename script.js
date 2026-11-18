(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- estado (os dados ficam no servidor; aqui é só uma cópia para pintar a tela) ---------- */
  let ME = null;                                   // usuário logado, ou null
  let CATS = [];                                   // categorias de exercícios
  const HOME = { aulas: [], concluidas: [], avaliou: false, avaliado: "Equipe Conect60+", pros: [], minhas: [] };
  const me = () => ME;
  const digits = s => (s || "").replace(/\D/g, "");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let lastTrigger = null, isPro = false;

  /* ---------- conversa com a API (o cookie de login vai junto automaticamente) ---------- */
  const API = "/api";
  const api = async (path, body, method) => {
    const opt = { method: method || (body ? "POST" : "GET"), credentials: "same-origin" };
    if (body) { opt.headers = { "Content-Type": "application/json" }; opt.body = JSON.stringify(body); }
    const r = await fetch(API + path, opt);
    return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
  };
  const OFFLINE = "Não foi possível falar com o servidor. Confira a internet e tente de novo.";
  // faz a chamada e, se der erro, mostra a mensagem no formulário; devolve os dados ou null
  const call = async (form, path, body, method) => {
    let r; try { r = await api(path, body, method); } catch { form ? fail(form, OFFLINE) : toast(OFFLINE); return null; }
    if (!r.ok) {
      const msg = r.data.erro || "Não foi possível concluir. Tente de novo.";
      if (r.status === 401 && ME) { ME = null; sync(); }
      form ? fail(form, msg, r.data.campo && form.elements[r.data.campo]) : toast(msg);
      return null;
    }
    return r.data;
  };
  const busy = (form, on) => $$("button[type=submit]", form).forEach(b => (b.disabled = on));

  /* ---------- avisos ---------- */
  const toast = msg => {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove("show"), 3200);
  };

  /* ---------- dialogs (focus trap e Esc nativos) ---------- */
  const open = name => {
    $$("dialog[open]").forEach(d => d.close());
    const d = $("#dlg-" + name);
    if (name === "profile") fillProfile();
    d.showModal();
    $$(".err", d).forEach(e => (e.textContent = ""));
    (d.querySelector("input,textarea") || d).focus();
  };
  const close = d => {
    if (!d.open) return;
    d.classList.add("closing");
    setTimeout(() => { d.classList.remove("closing"); d.close(); }, 200);
  };
  document.addEventListener("click", e => {
    const o = e.target.closest("[data-open]");
    if (o) { lastTrigger = o; open(o.dataset.open); return; }
    if (e.target.closest("[data-close]")) close(e.target.closest("dialog"));
    else if (e.target.tagName === "DIALOG") close(e.target);
    const g = e.target.closest("[data-go]");
    if (g) { e.preventDefault(); goHome(); window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
  });
  $$("dialog").forEach(d => {
    d.addEventListener("cancel", e => { e.preventDefault(); close(d); });
    d.addEventListener("close", () => lastTrigger && lastTrigger.isConnected && !lastTrigger.hidden && lastTrigger.focus());
  });

  /* ---------- transição entre páginas ---------- */
  const show = id => {
    const next = $("#view-" + id), cur = $(".view.is-active");
    if (cur === next) return;
    const swap = () => {
      $$(".view.is-active, .view.leaving").forEach(v => v.classList.remove("is-active", "leaving"));
      next.classList.add("is-active");
      window.scrollTo({ top: 0 });
      const h = $("h1", next); h && (h.tabIndex = -1, h.focus({ preventScroll: true }));
    };
    if (cur && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      cur.classList.add("leaving"); setTimeout(swap, 240);
    } else swap();
  };
  const goHome = () => {
    const u = me();
    if (/^#(exercicios\/|nosso-trabalho)/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
    show(u ? (u.pro ? "pro" : "elder") : "home");
  };

  /* ---------- sessão / interface ---------- */
  const sync = () => {
    const u = me();
    $("#btn-enter-top").hidden = !!u;
    paintAvatar();
    $("#btn-profile").hidden = $("#btn-logout").hidden = !u;
    $("#lnk-admin").hidden = !(u && u.admin);
    $("#pro-pending").hidden = !(u && u.pro && !u.crefitoVerificado);
    $$(".user-name").forEach(n => (n.textContent = u ? u.nome.split(" ")[0] : ""));
    paintHome();
    goHome();
  };
  // busca no servidor os dados da área do usuário (aulas, progresso, profissionais)
  async function loadHome() {
    if (!ME) return;
    try {
      if (ME.pro) {
        const r = await api("/minhas-aulas"); if (r.ok) HOME.minhas = r.data;
      } else {
        const [a, p, pr] = await Promise.all([api("/aulas/destaque"), api("/progresso"), api("/profissionais")]);
        if (a.ok) { HOME.aulas = a.data.aulas; HOME.avaliado = a.data.avaliado; }
        if (p.ok) { HOME.concluidas = p.data.concluidas; HOME.avaliou = p.data.avaliou; }
        if (pr.ok) HOME.pros = pr.data;
      }
    } catch { toast(OFFLINE); }
    paintHome();
  }
  const enter = (usuario, msg) => {
    ME = usuario; Object.assign(HOME, { aulas: [], concluidas: [], avaliou: false, pros: [], minhas: [] });
    closeAll(); sync(); loadHome(); toast(msg);
  };

  /* ---------- validação ---------- */
  const fail = (form, msg, field) => {
    $(".err", form).textContent = msg;
    $$("input", form).forEach(i => i.removeAttribute("aria-invalid"));
    if (field) { field.setAttribute("aria-invalid", "true"); field.focus(); }
    return false;
  };
  const check = (form, req) => {
    for (const n of req) {
      const f = form.elements[n];
      if (!f.value.trim()) return fail(form, "Preencha o campo: " + f.parentElement.firstChild.textContent.trim() + ".", f);
    }
    const t = form.elements.tel; if (t && digits(t.value).length < 10) return fail(form, "Informe um telefone com DDD.", t);
    const s = form.elements.senha; if (s && s.value && s.value.length < 6) return fail(form, "A senha precisa ter 6 caracteres ou mais.", s);
    return true;
  };

  /* ---------- cadastro ---------- */
  $("#toggle-pro").addEventListener("click", e => {
    isPro = !isPro;
    e.target.setAttribute("aria-pressed", isPro);
    e.target.textContent = isPro ? "Entre como idoso" : "Entre como profissional de saúde";
    $$("#f-signup .pro-only").forEach(x => (x.hidden = !isPro));
    $("#t-signup").textContent = isPro ? "Cadastro profissional" : "Cadastre-se";
  });
  $("#f-signup").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (!check(f, isPro ? ["nome", "email", "tel", "senha", "crefito"] : ["nome", "tel", "senha"])) return;
    busy(f, true);
    const d = await call(f, "/auth/cadastro", { nome: f.nome.value.trim(), telefone: digits(f.tel.value), senha: f.senha.value, perfil: isPro ? "pro" : "idoso", email: isPro ? f.email.value.trim() : "", crefito: isPro ? f.crefito.value.trim() : "" });
    busy(f, false);
    if (!d) return;
    f.reset(); enter(d.usuario, "Cadastro feito. Bem-vindo!");
  });

  /* ---------- login / senha ---------- */
  $("#f-login").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (!check(f, ["tel", "senha"])) return;
    busy(f, true);
    const d = await call(f, "/auth/login", { telefone: digits(f.tel.value), senha: f.senha.value });
    busy(f, false);
    if (!d) return;
    f.reset(); enter(d.usuario, "Você entrou.");
  });
  // Esqueci a senha: 1) pede o código (a equipe confirma por telefone)  2) usa o código para criar a senha nova
  $("#btn-code").addEventListener("click", async () => {
    const f = $("#f-reset");
    if (digits(f.tel.value).length < 10) return fail(f, "Informe um telefone com DDD.", f.tel);
    const d = await call(f, "/auth/senha/pedido", { telefone: digits(f.tel.value) });
    if (!d) return;
    $(".err", f).textContent = ""; $("#reset-ok").textContent = d.mensagem; toast("Pedido de código registrado.");
  });
  $("#f-reset").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (!check(f, ["tel", "codigo", "senha"])) return;
    if (digits(f.codigo.value).length !== 6) return fail(f, "O código tem 6 números.", f.codigo);
    busy(f, true);
    const d = await call(f, "/auth/senha/redefinir", { telefone: digits(f.tel.value), codigo: digits(f.codigo.value), senha: f.senha.value });
    busy(f, false);
    if (!d) return;
    f.reset(); $("#reset-ok").textContent = ""; close($("#dlg-reset")); toast("Senha alterada. Agora é só entrar.");
    setTimeout(() => open("login"), 300);
  });
  $("#btn-logout").addEventListener("click", async () => {
    try { await api("/auth/logout", {}); } catch { return toast(OFFLINE); }
    ME = null; sync(); toast("Você saiu.");
  });

  /* ---------- Google: cadastro e login (o servidor confere o token) ---------- */
  let gReady = false, gPending = null;
  const closeAll = () => $$("dialog[open]").forEach(close);
  const gMsg = m => { const d = $("dialog[open]"), e = d && $(".err", d); if (e) e.textContent = m; toast(m); };

  const initGoogle = async (tentativa = 0) => {
    if (!(window.google && google.accounts && google.accounts.id)) {
      if (tentativa < 40) setTimeout(() => initGoogle(tentativa + 1), 300);   // espera o script do Google carregar
      return;
    }
    try {
      const { data } = await api("/auth/config");
      if (!data.clientId) return;                                              // sem ID no servidor: o botão mostra o aviso
      google.accounts.id.initialize({ client_id: data.clientId, callback: r => sendGoogle({ credential: r.credential }) });
      $$(".g-btn").forEach(box => {
        box.textContent = "";
        google.accounts.id.renderButton(box, { type: "standard", theme: "outline", size: "large", shape: "pill", text: box.dataset.text, locale: "pt-BR", width: 300 });
      });
      gReady = true;
    } catch { /* servidor fora do ar: mantém o botão de aviso */ }
  };
  initGoogle();

  $$("[data-google-fallback]").forEach(b => b.addEventListener("click", async () => {
    if (gReady) return;
    let r; try { r = await api("/auth/config"); } catch { return gMsg(OFFLINE); }
    if (!r.data.clientId) return gMsg("O login com o Google ainda não foi configurado. Use telefone e senha.");
    gMsg("Não foi possível carregar o Google. Confira a conexão e recarregue a página.");
  }));

  async function sendGoogle(body) {
    let r; try { r = await api("/auth/google", body); } catch { return gMsg(OFFLINE); }
    const d = r.data;
    if (!r.ok) return gMsg(d.erro || "Não foi possível entrar com o Google.");
    if (d.precisaCompletar) {                         // conta nova: falta o telefone e o tipo de perfil
      gPending = { credential: body.credential };
      const f = $("#f-google"); f.reset();
      f.nome.value = d.perfil.nome || ""; $(".g-pro", f).hidden = true;
      $("#g-name").textContent = d.perfil.nome || d.perfil.email; $("#g-email").textContent = d.perfil.email;
      const ph = $("#g-photo"); if (d.perfil.foto) ph.src = d.perfil.foto; ph.hidden = !d.perfil.foto;
      return open("google");
    }
    gPending = null;
    enter(d.usuario, r.status === 201 ? "Cadastro feito com o Google. Bem-vindo!" : "Você entrou com o Google.");
  }

  $("#f-google").addEventListener("change", e => {
    if (e.target.name === "perfil") $(".g-pro", e.currentTarget).hidden = e.currentTarget.perfil.value !== "pro";
  });
  $("#f-google").addEventListener("submit", e => {
    e.preventDefault(); const f = e.target;
    if (!gPending) return close($("#dlg-google"));
    const pro = f.perfil.value === "pro";
    if (!check(f, pro ? ["nome", "tel", "crefito"] : ["nome", "tel"])) return;
    sendGoogle({ credential: gPending.credential, nome: f.nome.value.trim(), telefone: digits(f.tel.value), perfil: pro ? "pro" : "idoso", crefito: pro ? f.crefito.value.trim() : "" });
  });

  /* ---------- perfil (pop-up) ---------- */
  function fillProfile() {
    const u = me(), f = $("#f-profile"); if (!u) return;
    $("#t-profile").textContent = u.pro ? "Perfil do Profissional" : "Perfil do Idoso";
    $$(".pro-only", f).forEach(x => (x.hidden = !u.pro));
    $$(".elder-only", f).forEach(x => (x.hidden = u.pro));
    ["nome", "titulo", "resumo"].forEach(k => (f[k].value = u[k] || ""));
    f.tel.value = u.telefone; f.hashview.value = u.temSenha ? "********" : "Entrou com o Google";
    f.atual.placeholder = u.temSenha ? "" : "Não precisa: conta Google";
    ["atual", "nova", "conf"].forEach(k => (f[k].value = ""));
    resetDelete();
    paintAvatar();
  }
  $("#f-profile").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (!check(f, ["nome", "tel"])) return;
    busy(f, true);
    const d = await call(f, "/perfil", { nome: f.nome.value.trim(), telefone: digits(f.tel.value), titulo: f.titulo.value, resumo: f.resumo.value }, "PUT");
    busy(f, false);
    if (!d) return;
    ME = d.usuario; close($("#dlg-profile")); sync(); toast("Perfil atualizado.");
  });

  $("#btn-newpass").addEventListener("click", async () => {
    const f = $("#f-profile"), u = me();
    const bad = (m, fld) => { fail(f, m, fld); toast(m); };
    if (u.temSenha && !f.atual.value) return bad("Digite a senha atual.", f.atual);
    if (f.nova.value.length < 6) return bad("A nova senha precisa ter 6 caracteres ou mais.", f.nova);
    if (f.nova.value !== f.conf.value) return bad("A confirmação não é igual à nova senha.", f.conf);
    const d = await call(f, "/perfil/senha", { atual: f.atual.value, nova: f.nova.value }, "PUT");
    if (!d) return;
    ME = d.usuario;
    f.hashview.value = "********"; f.atual.placeholder = ""; ["atual", "nova", "conf"].forEach(k => (f[k].value = ""));
    $(".err", f).textContent = ""; $$("input", f).forEach(i => i.removeAttribute("aria-invalid"));
    toast("Senha atualizada.");
  });

  // excluir a conta: pede um segundo toque para confirmar
  const delBtn = $("#btn-delete"); let delArmed = false;
  function resetDelete() { delArmed = false; delBtn.textContent = "Excluir minha conta"; }
  delBtn.addEventListener("click", async () => {
    if (!delArmed) { delArmed = true; delBtn.textContent = "Toque de novo para excluir de vez"; return toast("Isso apaga a sua conta e todos os seus dados. Toque de novo para confirmar."); }
    const d = await call($("#f-profile"), "/perfil", null, "DELETE");
    resetDelete(); if (!d) return;
    ME = null; closeAll(); sync(); toast("Sua conta e os seus dados foram excluídos.");
  });

  /* ---------- conteúdo das áreas ---------- */
  const mk = (sel, items, fn) => ($(sel).innerHTML = items.map((x, i) => `<li class="${fn.c}" style="animation-delay:${i * 70}ms">${fn(x, i)}</li>`).join(""));
  const THUMBS = ["hero-alongamento", "fisio-orientando", "clinica", "fisioterapeuta"];
  const lesson = (a, i) => `<button type="button" data-i="${i}" style="--thumb:url('imagens/${THUMBS[i % 4]}.jpg')" aria-label="Reproduzir aula: ${esc(a.titulo)}"></button><span>${esc(a.titulo)}</span>`; lesson.c = "lesson";
  const tile = (c, i) => `<button type="button" data-cat="${i}"><img src="${esc(c.img)}" alt="" loading="lazy">${esc(c.n)}</button>`; tile.c = "tile";

  function paintHome() {
    const u = me();
    mk("#lessons", u && !u.pro ? HOME.aulas : [], lesson);
    mk("#boards", u && u.pro ? HOME.minhas : [], lesson);
    $("#boards-empty").hidden = !(u && u.pro && !HOME.minhas.length);
    mk("#tiles", CATS, tile);
    renderPros(); paintPublished(); paintProgress();
  }

  // profissional: publicar aulas (cria a aula e envia o arquivo para o servidor)
  const TIPOS_OK = /^(video\/(mp4|webm|ogg|quicktime)|image\/(jpeg|png|webp))$/;
  $("#file-up").addEventListener("change", async e => {
    const files = [...e.target.files]; e.target.value = "";
    if (!files.length || !ME || !ME.pro) return;
    const st = $("#up-status"); let enviados = 0;
    for (const [i, file] of files.entries()) {
      if (!TIPOS_OK.test(file.type)) { toast(`"${file.name}": formato não aceito. Use vídeo MP4, WEBM ou MOV, ou imagem JPG, PNG ou WEBP.`); continue; }
      st.textContent = `Enviando ${i + 1} de ${files.length}: ${file.name}… Não feche a página.`;
      const aula = await call(null, "/aulas", { titulo: file.name.replace(/\.[^.]+$/, "").slice(0, 150) });
      if (!aula) continue;
      let r = null;
      try { r = await fetch(`${API}/aulas/${aula.id}/arquivo`, { method: "PUT", credentials: "same-origin", headers: { "Content-Type": file.type }, body: file }); } catch { /* sem conexão */ }
      if (!r || !r.ok) {
        const d = r ? await r.json().catch(() => ({})) : {};
        toast(d.erro || `Não foi possível enviar "${file.name}".`);
        try { await api(`/aulas/${aula.id}`, null, "DELETE"); } catch { /* fica sem arquivo; pode apagar depois */ }
        continue;
      }
      enviados++;
    }
    st.textContent = "";
    await loadHome();
    if (enviados) toast(enviados === 1 ? "Atividade publicada." : `${enviados} atividades publicadas.`);
  });
  function paintPublished() {
    const u = me();
    $("#published").innerHTML = u && u.pro ? HOME.minhas.map(a => `<li>✔ ${esc(a.titulo)} <button type="button" class="link" data-del="${a.id}" aria-label="Apagar a aula ${esc(a.titulo)}">Apagar</button></li>`).join("") : "";
  }
  $("#published").addEventListener("click", async e => {
    const b = e.target.closest("[data-del]"); if (!b) return;
    if (b.dataset.armed !== "1") { b.dataset.armed = "1"; b.textContent = "Toque de novo para apagar"; return; }
    if (await call(null, `/aulas/${b.dataset.del}`, null, "DELETE")) { await loadHome(); toast("Aula apagada."); }
  });

  /* ---------- aulas e avaliação ---------- */
  let current = null;                                  // aula aberta no player
  const allDone = () => HOME.aulas.length > 0 && HOME.aulas.every(a => HOME.concluidas.includes(a.id));

  function paintProgress() {
    const u = me(); if (!u || u.pro) return;
    $$("#lessons .lesson").forEach((li, i) => li.classList.toggle("done", HOME.concluidas.includes(HOME.aulas[i].id)));
    const feitas = HOME.aulas.filter(a => HOME.concluidas.includes(a.id)).length;
    $("#progress").textContent = HOME.aulas.length ? `${feitas} de ${HOME.aulas.length} aulas concluídas` : "";
    $("#btn-rate").hidden = !(allDone() && !HOME.avaliou);
  }
  function playLesson(aula) {
    lastTrigger = document.activeElement; current = aula;
    const v = $("#player"), im = $("#player-img"); $("#t-player").textContent = aula.titulo;
    $("#player-hint").textContent = "";
    const src = `${API}/aulas/${aula.id}/video`;
    v.hidden = !!aula.ehImagem; im.hidden = !aula.ehImagem;
    if (aula.ehImagem) { im.src = src; im.alt = aula.titulo; }
    else if (aula.temVideo) v.src = src;
    else { v.removeAttribute("src"); v.load(); $("#player-hint").textContent = "O vídeo desta aula ainda não foi publicado. Você pode tocar em “Concluir aula” depois de praticar."; }
    $("#dlg-player").showModal(); (aula.ehImagem ? $("#btn-finish") : v).focus();
  }
  const pickLesson = list => e => { const b = e.target.closest("button[data-i]"); if (b && list()[+b.dataset.i]) playLesson(list()[+b.dataset.i]); };
  $("#lessons").addEventListener("click", pickLesson(() => HOME.aulas));
  $("#boards").addEventListener("click", pickLesson(() => HOME.minhas));
  $("#player").addEventListener("error", () => { if ($("#player").getAttribute("src")) $("#player-hint").textContent = "Não foi possível carregar o vídeo agora. Você ainda pode usar “Concluir aula”."; });
  $("#player").addEventListener("ended", () => finishLesson());
  $("#dlg-player").addEventListener("close", () => { const v = $("#player"); v.pause(); v.removeAttribute("src"); v.load(); $("#player-img").removeAttribute("src"); });
  $("#btn-finish").addEventListener("click", finishLesson);

  async function finishLesson() {
    const aula = current, u = me();
    if (!aula || !u || u.pro) { close($("#dlg-player")); return; }
    if (!await call(null, `/progresso/${aula.id}`, {})) return;
    if (!HOME.concluidas.includes(aula.id)) HOME.concluidas.push(aula.id);
    close($("#dlg-player")); paintProgress();
    toast(`Aula concluída: ${aula.titulo}`);
    if (allDone() && !HOME.avaliou && HOME.aulas.some(a => a.id === aula.id)) setTimeout(() => open("rate"), 450);
  }

  const rateForm = $("#f-rate"), saveBtn = $("#btn-save");
  const rateText = () => "Como foi a sua experiência com este fisioterapeuta? As opções são: Não gostei, Neutro, Gostei e Ótimo.";
  $("#dlg-rate").addEventListener("close", () => { speechSynthesis && speechSynthesis.cancel(); });
  rateForm.addEventListener("change", () => (saveBtn.disabled = !rateForm.nota.value));
  $("#btn-listen").addEventListener("click", () => {
    if (!("speechSynthesis" in window)) return toast("Seu navegador não tem leitura em voz alta.");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(rateText()); u.lang = "pt-BR"; u.rate = .9; speechSynthesis.speak(u);
  });
  rateForm.addEventListener("submit", async e => {
    e.preventDefault(); if (!rateForm.nota.value) return;
    if (!await call(null, "/avaliacoes", { nota: +rateForm.nota.value })) return;
    HOME.avaliou = true;
    rateForm.reset(); saveBtn.disabled = true; close($("#dlg-rate")); paintProgress(); toast("Obrigado pela sua avaliação!");
  });
  // preenche nome e reinicia o formulário sempre que a avaliação abrir
  new MutationObserver(() => { if ($("#dlg-rate").open) { $("#rate-pro").textContent = HOME.avaliado; rateForm.reset(); saveBtn.disabled = true; } })
    .observe($("#dlg-rate"), { attributes: true, attributeFilter: ["open"] });

  /* ---------- trabalho + rodapé + contato ---------- */
  document.documentElement.classList.add("js");
  const wg = $(".work-grid");
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((en, o) => en.forEach(x => { if (x.isIntersecting) { wg.classList.add("in"); o.disconnect(); } }), { threshold: .25 }).observe(wg);
  } else wg.classList.add("in");
  // toque no celular: alterna o texto sobre a foto
  $$(".work figure").forEach(f => f.addEventListener("click", () => {
    const on = !f.classList.contains("show");
    $$(".work figure.show").forEach(x => x.classList.remove("show")); f.classList.toggle("show", on);
  }));
  $$(".work figure").forEach(f => f.addEventListener("keydown", e => { if (e.key === "Escape") f.blur(); }));
  $("#f-contact").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (!check(f, ["nome", "email", "msg"])) return;
    if (!/^\S+@\S+\.\S+$/.test(f.email.value)) return fail(f, "Informe um e-mail válido.", f.email);
    busy(f, true);
    const d = await call(f, "/contato", { nome: f.nome.value.trim(), email: f.email.value.trim(), mensagem: f.msg.value.trim() });
    busy(f, false);
    if (!d) return;
    f.reset(); close($("#dlg-contact")); toast("Mensagem enviada. Obrigado! Vamos responder pelo seu e-mail.");
  });

  /* ---------- páginas das categorias de exercícios ---------- */
  function renderCat(i) {
    const c = CATS[i], prev = CATS[(i + CATS.length - 1) % CATS.length], next = CATS[(i + 1) % CATS.length];
    $("#cat-img").src = c.img; $("#h-cat").textContent = c.n; $("#cat-crumb").textContent = c.n; $("#cat-desc").textContent = c.d;
    document.title = `${c.n} | Exercícios | Conect60+`;
    $("#ex-list").innerHTML = c.ex.map(([nome, tempo, nivel, passos], k) => `
      <li class="ex" style="animation-delay:${k * 90}ms">
        <h2>${esc(nome)}</h2>
        <p class="meta"><span>⏱ ${esc(tempo)}</span><span>Nível: ${esc(nivel)}</span></p>
        <details><summary>Ver passo a passo</summary><ol>${passos.map(p => `<li>${esc(p)}</li>`).join("")}</ol></details>
      </li>`).join("");
    $("#cat-prev").textContent = "← " + prev.n; $("#cat-prev").dataset.cat = (i + CATS.length - 1) % CATS.length;
    $("#cat-next").textContent = next.n + " →"; $("#cat-next").dataset.cat = (i + 1) % CATS.length;
  }
  const openCat = i => { location.hash = "#exercicios/" + CATS[i].slug; };
  const leaveCat = () => { document.title = "Conect60+ | Exercícios para a terceira idade"; goHome(); };
  function route() {
    const m = location.hash.match(/^#exercicios\/([\w-]+)$/), u = me();
    const i = m ? CATS.findIndex(c => c.slug === m[1]) : -1;
    if (location.hash === "#nosso-trabalho") { document.title = "Nosso trabalho | Conect60+"; show("team"); }
    else if (i >= 0 && u && !u.pro) {
      const same = $("#view-cat").classList.contains("is-active");
      renderCat(i); show("cat");
      if (same) { window.scrollTo({ top: 0, behavior: "smooth" }); $("#h-cat").tabIndex = -1; $("#h-cat").focus({ preventScroll: true }); }
    }
    else if ($("#view-cat").classList.contains("is-active") || $("#view-team").classList.contains("is-active")) leaveCat();
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-cat]"); if (b) { lastTrigger = b; openCat(+b.dataset.cat); }
  });
  const backToList = e => { e && e.preventDefault(); leaveCat(); setTimeout(() => $("#tiles button")?.scrollIntoView({ block: "center" }), 350); };
  $("#cat-back").addEventListener("click", backToList);
  $("#crumb-back").addEventListener("click", backToList);

  /* ---------- foto de perfil ---------- */
  function paintAvatar() {
    const u = me(), has = !!(u && u.foto);
    [["#avatar-img", "#avatar-svg"], ["#top-avatar", "#top-avatar-svg"]].forEach(([i, s]) => {
      const img = $(i); if (has) img.src = u.foto; img.hidden = !has; $(s).toggleAttribute("hidden", has); // svg não tem a propriedade .hidden
    });
    $("#photo-remove").hidden = !has;
    $("#btn-profile").setAttribute("aria-label", has ? "Abrir meu perfil (com foto)" : "Abrir meu perfil");
  }
  const cropSquare = file => new Promise((ok, no) => {
    const r = new FileReader();
    r.onerror = no;
    r.onload = () => {
      const im = new Image(); im.onerror = no;
      im.onload = () => {
        const S = 256, s = Math.min(im.width, im.height), c = document.createElement("canvas");
        c.width = c.height = S;
        c.getContext("2d").drawImage(im, (im.width - s) / 2, (im.height - s) / 2, s, s, 0, 0, S, S);
        ok(c.toDataURL("image/jpeg", .85));
      };
      im.src = r.result;
    };
    r.readAsDataURL(file);
  });
  const savePhoto = async foto => {
    const d = foto ? await call(null, "/perfil/foto", { foto }, "PUT") : await call(null, "/perfil/foto", null, "DELETE");
    if (!d) return;
    ME = d.usuario; paintAvatar(); toast(foto ? "Foto de perfil atualizada." : "Foto removida.");
  };
  $("#photo-input").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return toast("Escolha uma imagem PNG, JPG ou WEBP.");
    if (f.size > 8 * 1024 * 1024) return toast("A imagem é muito grande. Use uma de até 8 MB.");
    let foto; try { foto = await cropSquare(f); } catch { return toast("Não foi possível ler essa imagem."); }
    savePhoto(foto);
  });
  $("#photo-remove").addEventListener("click", () => savePhoto(""));

  /* ---------- profissionais (visão do idoso) ---------- */
  function renderPros() {
    const u = me(), list = u && !u.pro ? HOME.pros : [];
    $("#pros").innerHTML = list.map((p, i) => `<li><button type="button" class="pro-av" data-pro="${i}" aria-label="Ver perfil e aulas de ${esc(p.nome)}">${p.foto ? `<img src="${esc(p.foto)}" alt="" referrerpolicy="no-referrer">` : `<span class="pro-ph" aria-hidden="true">${esc((p.nome.trim()[0] || "?").toUpperCase())}</span>`}<b>${esc(p.nome)}</b><small>${esc(p.titulo)}</small></button></li>`).join("");
  }
  let proOpen = null;
  $("#pros").addEventListener("click", e => {
    const b = e.target.closest("[data-pro]"); if (!b) return;
    lastTrigger = b; const p = proOpen = HOME.pros[+b.dataset.pro], ph = $("#pro-photo");
    if (p.foto) { ph.src = p.foto; ph.hidden = false; } else ph.hidden = true;
    ph.alt = "Foto de " + p.nome;
    $("#pro-name").textContent = p.nome; $("#pro-title").textContent = p.titulo; $("#pro-sum").textContent = p.resumo; $("#pro-demo").hidden = !p.demo;
    $("#pro-lessons").innerHTML = p.aulas.length
      ? p.aulas.map((a, k) => `<li><span>${esc(a.titulo)}${a.duracao ? `<small>${esc(a.duracao)}</small>` : ""}</span><button type="button" class="btn btn-sm" data-play="${k}" aria-label="Assistir ${esc(a.titulo)}">▶ Assistir</button></li>`).join("")
      : `<li class="empty">Este profissional ainda não publicou aulas.</li>`;
    $("#dlg-pro").showModal();
  });
  $("#pro-lessons").addEventListener("click", e => {
    const b = e.target.closest("[data-play]"); if (b && proOpen) playLesson(proOpen.aulas[+b.dataset.play]);
  });

  /* ---------- acessibilidade ---------- */
  const A = (() => { try { return JSON.parse(localStorage.getItem("c60_a11y")) || {}; } catch { return {}; } })();
  A.fs = A.fs || 100;
  const saveA = () => { try { localStorage.setItem("c60_a11y", JSON.stringify(A)); } catch {} };
  const setPressed = (s, v) => $(s).setAttribute("aria-pressed", String(!!v));
  function applyA() {
    document.documentElement.style.fontSize = A.fs + "%";
    document.documentElement.classList.toggle("hc", !!A.hc);
    $("#fs-val").textContent = A.fs + "%";
    setPressed("#opt-hc", A.hc); setPressed("#opt-libras", A.libras);
  }
  const setFs = v => { A.fs = Math.min(150, Math.max(80, v)); saveA(); applyA(); };
  $("#fs-plus").addEventListener("click", () => setFs(A.fs + 10));
  $("#fs-minus").addEventListener("click", () => setFs(A.fs - 10));
  $("#fs-reset").addEventListener("click", () => setFs(100));
  $("#opt-hc").addEventListener("click", () => { A.hc = !A.hc; saveA(); applyA(); });

  const synth = window.speechSynthesis;
  const stopReading = () => { synth && synth.cancel(); setPressed("#opt-read", false); };
  function readText(text) {
    const parts = text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]*/g) || [text], chunks = []; let cur = "";
    parts.forEach(s => { if ((cur + s).length > 180) { cur && chunks.push(cur); cur = s; } else cur += s; }); cur && chunks.push(cur);
    chunks.forEach((c, i) => {
      const u = new SpeechSynthesisUtterance(c.trim()); u.lang = "pt-BR"; u.rate = .95;
      if (i === chunks.length - 1) u.onend = u.onerror = () => setPressed("#opt-read", false);
      synth.speak(u);
    });
  }
  $("#opt-read").addEventListener("click", () => {
    if (!synth) return toast("Seu navegador não tem leitura em voz alta.");
    if (synth.speaking) return stopReading();
    const sel = String(getSelection()).trim();
    readText(sel || ($(".view.is-active") || $("main")).innerText);
    setPressed("#opt-read", true); toast(sel ? "Lendo o trecho selecionado…" : "Lendo a página… Toque de novo para parar.");
  });

  function setLibras(on, quiet) {
    A.libras = on; saveA(); applyA();
    let w = $("[vw]");
    if (on && !w) {
      w = document.createElement("div"); w.setAttribute("vw", ""); w.className = "enabled";
      w.innerHTML = '<div vw-access-button class="active"></div><div vw-plugin-wrapper><div class="vw-plugin-top-wrapper"></div></div>';
      document.body.append(w);
      const s = document.createElement("script"); s.src = "https://vlibras.gov.br/app/vlibras-plugin.js";
      s.onload = () => { try { new window.VLibras.Widget("https://vlibras.gov.br/app"); } catch {} };
      s.onerror = () => { toast("Não foi possível carregar o VLibras. Verifique a internet."); w.remove(); A.libras = false; saveA(); applyA(); };
      document.body.append(s);
    } else if (w) w.style.display = on ? "" : "none";
    if (on && !quiet) toast("VLibras ativado: use o botão azul com as mãos, na lateral da tela.");
  }
  $("#opt-libras").addEventListener("click", () => setLibras(!A.libras));

  const tg = $("#a11y-toggle"), pn = $("#a11y-panel");
  const togglePanel = on => { pn.hidden = !on; tg.setAttribute("aria-expanded", String(on)); if (on) $("#fs-minus").focus(); };
  tg.addEventListener("click", () => togglePanel(pn.hidden));
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !pn.hidden) { togglePanel(false); tg.focus(); } });
  document.addEventListener("click", e => { if (!pn.hidden && !e.target.closest("#a11y")) togglePanel(false); });
  applyA(); if (A.libras) setLibras(true, true);

  /* ---------- início: pergunta ao servidor quem está logado e carrega o conteúdo ---------- */
  const h0 = location.hash;
  (async () => {
    try {
      const [eu, cats] = await Promise.all([api("/auth/eu"), api("/categorias")]);
      if (cats.ok) CATS = cats.data.map(c => ({ n: c.nome, slug: c.slug, img: c.imagem, d: c.descricao, ex: c.exercicios.map(x => [x.nome, x.duracao, x.nivel, x.passos]) }));
      if (eu.ok && eu.data.usuario) ME = eu.data.usuario;
    } catch { toast(OFFLINE); }
    sync();
    await loadHome();
    if (/^#(exercicios\/|nosso-trabalho)/.test(h0)) { if (location.hash !== h0) location.hash = h0; else route(); }
  })();
})();
