(() => {
  const STORAGE_KEY = "mdnotes.notes.v1";
  const THEME_KEY = "mdnotes.theme";

  /** @typedef {{id:string,title:string,content:string,pinned:boolean,updatedAt:number}} Note */
  /** @type {Note[]} */
  let notes = [];
  let currentId = null;

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  const els = {
    search: $("#search"),
    list: $("#noteList"),
    itemTpl: $("#itemTpl"),
    title: $("#title"),
    content: $("#content"),
    preview: $("#preview"),
    newBtn: $("#newBtn"),
    deleteBtn: $("#deleteBtn"),
    pinBtn: $("#pinBtn"),
    previewToggle: $("#previewToggle"),
    closeDialog: $("#closeDialog"),
    themeBtn: $("#themeBtn"),
    exportBtn: $("#exportBtn"),
    importInput: $("#importInput"),
  };

  /* ===== Mobile popup wiring ===== */
  const noteDialog = document.getElementById("noteDialog");
  const dialogShell = noteDialog?.querySelector(".note-dialog-shell");
  const editorEl = document.querySelector(".editor");

  // anchor to restore editor when leaving mobile
  const editorAnchor = document.createElement("div");
  editorAnchor.id = "editor-anchor";
  editorEl?.parentNode?.insertBefore(editorAnchor, editorEl);

  const isMobile = () => window.matchMedia("(max-width: 680px)").matches;

  function updatePreviewToggle() {
    if (els.previewToggle) {
      els.previewToggle.style.display = isMobile() ? 'inline-block' : 'none';
    }
  }

  function updateNewButtonPosition() {
    const searchEl = document.querySelector('.search');
    
    if (!searchEl) return;
    
    // Clear any existing cloned buttons
    const existingClonedBtns = searchEl.querySelectorAll('#newBtn');
    existingClonedBtns.forEach(btn => {
      if (btn !== els.newBtn) {
        btn.remove();
      }
    });
    
    if (isMobile()) {
      // Add class and clone button to search area
      searchEl.classList.add('with-new-btn');
      if (els.newBtn && !searchEl.contains(els.newBtn)) {
        const clonedBtn = els.newBtn.cloneNode(true);
        clonedBtn.addEventListener('click', createNote);
        searchEl.appendChild(clonedBtn);
      }
    } else {
      // Remove class
      searchEl.classList.remove('with-new-btn');
    }
  }

  function moveEditorInline() {
    if (!editorEl || !editorAnchor.parentNode) return;
    const sameParent = editorEl.parentNode === editorAnchor.parentNode;
    if (!sameParent)
      editorAnchor.parentNode.insertBefore(editorEl, editorAnchor.nextSibling);
    updatePreviewToggle();
  }
  function openEditorIfMobile() {
    if (!isMobile()) {
      moveEditorInline();
      if (noteDialog?.open) noteDialog.close();
      return;
    }
    if (noteDialog && dialogShell && editorEl) {
      dialogShell.appendChild(editorEl);
      if (!noteDialog.open) noteDialog.showModal();
      updatePreviewToggle();
    }
  }
  noteDialog?.addEventListener("click", (e) => {
    if (e.target === noteDialog) noteDialog.close();
  });
  noteDialog?.addEventListener("close", () => {
    moveEditorInline();
    // Reset preview state when closing dialog
    showingPreview = false;
    if (els.previewToggle) {
      els.previewToggle.textContent = "👁️ Preview";
    }
    editorEl?.classList.remove("show-preview");
    noteDialog?.classList.remove("show-preview");
  });
  window.addEventListener("resize", () => {
    if (!isMobile()) {
      moveEditorInline();
      if (noteDialog?.open) noteDialog.close();
    }
    updateNewButtonPosition();
  });

  /* ===== Safe storage ===== */
  const safeGet = (k, fb = null) => {
    try {
      return localStorage.getItem(k) ?? fb;
    } catch {
      return fb;
    }
  };
  const safeSet = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch {}
  };
  const save = () => safeSet(STORAGE_KEY, JSON.stringify(notes));
  const load = () => {
    try {
      notes = JSON.parse(safeGet(STORAGE_KEY, "[]"));
    } catch {
      notes = [];
    }
  };

  /* ===== Utils ===== */
  const uid = () =>
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(6);
  const fmtDate = (ts) => new Date(ts).toISOString().slice(0, 10);

  function mdToHtml(md) {
    if (!md) return "";
    let src = md
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const blocks = [];
    src = src.replace(/```([\s\S]*?)```/g, (_, code) => {
      const i = blocks.push(code) - 1;
      return `\uE000${i}\uE000`;
    });
    src = src
      .replace(/^######\s+(.*)$/gm, "<h6>$1</h6>")
      .replace(/^#####\s+(.*)$/gm, "<h5>$1</h5>")
      .replace(/^####\s+(.*)$/gm, "<h4>$1</h4>")
      .replace(/^###\s+(.*)$/gm, "<h3>$1</h3>")
      .replace(/^##\s+(.*)$/gm, "<h2>$1</h2>")
      .replace(/^#\s+(.*)$/gm, "<h1>$1</h1>");
    src = src.replace(/^\s*[-*_]{3,}\s*$/gm, "<hr/>");
    src = src.replace(/^(?:- |\* )(.*(?:\n(?:- |\* ).*)*)/gm, (m) => {
      const items = m
        .split(/\n/)
        .map((l) => l.replace(/^(?:- |\* )/, "").trim())
        .map((t) => `<li>${t}</li>`)
        .join("");
      return `<ul>${items}</ul>`;
    });
    src = src
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*(?!\*)(.+?)\*/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
      );
    src = src
      .split(/\n{2,}/)
      .map((block) => {
        if (/^\s*<(h\d|ul|pre|hr)/.test(block)) return block;
        return `<p>${block.replace(/\n/g, "<br/>")}</p>`;
      })
      .join("\n");
    src = src.replace(
      /\uE000(\d+)\uE000/g,
      (_, i) => `<pre><code>${blocks[i]}</code></pre>`
    );
    return src;
  }

  /* ===== Rendering ===== */
  function renderList() {
    const q = (els.search?.value || "").trim().toLowerCase();
    const view = notes
      .filter(
        (n) => q === "" || (n.title + " " + n.content).toLowerCase().includes(q)
      )
      .sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);

    els.list.innerHTML = "";
    for (const n of view) {
      const li = els.itemTpl.content.firstElementChild.cloneNode(true);
      const row = li.querySelector(".note-row");
      row.classList.toggle("pinned", n.pinned);
      row.querySelector(".note-title").textContent = n.title || "(Untitled)";
      row.querySelector(".date").textContent = fmtDate(n.updatedAt);
      row.addEventListener("click", () => selectNote(n.id));
      els.list.appendChild(li);
    }
  }

  function renderEditor() {
    const note = notes.find((n) => n.id === currentId);
    els.title.value = note?.title || "";
    els.content.value = note?.content || "";
    els.preview.innerHTML = mdToHtml(els.content.value);
    els.pinBtn.textContent = note?.pinned ? "📌 Unpin" : "📌 Pin";
    els.deleteBtn.disabled = !note;
    els.pinBtn.disabled = !note;
  }

  function selectNote(id) {
    currentId = id;
    renderEditor();
    // Reset preview toggle state when selecting new note
    showingPreview = false;
    if (els.previewToggle) {
      els.previewToggle.textContent = "👁️ Preview";
    }
    // Remove preview class from editor and dialog
    editorEl?.classList.remove("show-preview");
    noteDialog?.classList.remove("show-preview");
    openEditorIfMobile(); // เปิดเป็น popup เมื่อจอเล็ก
  }

  /* ===== CRUD ===== */
  function createNote() {
    const n = {
      id: uid(),
      title: "New note",
      content: "",
      pinned: false,
      updatedAt: Date.now(),
    };
    notes.unshift(n);
    save();
    renderList();
    selectNote(n.id);
    els.title.focus();
  }
  function updateCurrent(partial) {
    const i = notes.findIndex((n) => n.id === currentId);
    if (i === -1) return;
    notes[i] = { ...notes[i], ...partial, updatedAt: Date.now() };
    save();
    renderList();
  }
  function removeCurrent() {
    if (!currentId) return;
    if (!confirm("Delete this note?")) return;
    notes = notes.filter((n) => n.id !== currentId);
    save();
    renderList();
    currentId = notes[0]?.id || null;
    if (!currentId && noteDialog?.open) noteDialog.close();
    renderEditor();
  }
  function togglePin() {
    const i = notes.findIndex((n) => n.id === currentId);
    if (i === -1) return;
    notes[i].pinned = !notes[i].pinned;
    notes[i].updatedAt = Date.now();
    save();
    renderList();
    renderEditor();
  }

  /* ===== Events ===== */
  let t1, t2;
  els.title?.addEventListener("input", () => {
    clearTimeout(t1);
    t1 = setTimeout(
      () => updateCurrent({ title: els.title.value.trim() }),
      250
    );
  });
  els.content?.addEventListener("input", () => {
    clearTimeout(t2);
    els.preview.innerHTML = mdToHtml(els.content.value);
    t2 = setTimeout(() => updateCurrent({ content: els.content.value }), 300);
  });

  els.newBtn?.addEventListener("click", createNote);
  els.deleteBtn?.addEventListener("click", removeCurrent);
  els.pinBtn?.addEventListener("click", togglePin);
  els.search?.addEventListener("input", renderList);
  
  // Debug: Re-attach search event listener to ensure it works
  window.addEventListener("load", () => {
    const searchInput = document.getElementById("search");
    if (searchInput && !searchInput.hasAttribute("data-listener-attached")) {
      searchInput.addEventListener("input", renderList);
      searchInput.setAttribute("data-listener-attached", "true");
      console.log("Search listener attached");
    }
  });

  // Mobile preview toggle
  let showingPreview = false;
  els.previewToggle?.addEventListener("click", () => {
    showingPreview = !showingPreview;
    const target = noteDialog?.open ? noteDialog : editorEl;
    if (target) {
      target.classList.toggle("show-preview", showingPreview);
    }
    els.previewToggle.textContent = showingPreview ? "📝 Edit" : "👁️ Preview";
  });

  // Close dialog button
  els.closeDialog?.addEventListener("click", () => {
    if (noteDialog?.open) {
      noteDialog.close();
    }
  });

  // theme toggle
  const applyTheme = (th) =>
    document.documentElement.setAttribute("data-theme", th);
  els.themeBtn?.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") || "dark";
    const next = cur === "light" ? "dark" : "light";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  });

  // export/import
  els.exportBtn?.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notes-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  els.importInput?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        notes = data;
        save();
        renderList();
        currentId = notes[0]?.id || null;
        renderEditor();
      } else alert("Invalid file format");
    } catch {
      alert("Cannot parse file");
    }
    e.target.value = "";
  });

  // shortcuts
  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "k") {
      e.preventDefault();
      els.search?.focus();
    }
    if (mod && e.key.toLowerCase() === "n") {
      e.preventDefault();
      createNote();
    }
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault(); /* autosave */
    }
  });

  /* ===== Init ===== */
  applyTheme(
    (() => {
      try {
        return localStorage.getItem("mdnotes.theme");
      } catch {
        return null;
      }
    })() ||
      (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
  );
  load();
  renderList();
  updatePreviewToggle();
  updateNewButtonPosition();

  // seed if empty
  if (!notes.length) {
    notes = [
      {
        id: uid(),
        title: "Welcome 👋",
        content:
          "# Markdown Notes\n\n- **Bold**, *italic*, and `code`\n- Lists, links: [MD CheatSheet](https://www.markdownguide.org/)\n\n```js\nconsole.log('Hello Markdown');\n```\n",
        pinned: true,
        updatedAt: Date.now(),
      },
    ];
    save();
    renderList();
  }
  currentId = notes[0]?.id || null;
  renderEditor();
})();
