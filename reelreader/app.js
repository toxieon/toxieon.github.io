(function (root) {
  "use strict";

  const STORAGE_KEY = "reelReader.apiKey";
  const ALLOWED_HOSTS = [
    "instagram.com",
    "www.instagram.com",
    "tiktok.com",
    "www.tiktok.com",
    "youtube.com",
    "www.youtube.com",
    "youtu.be"
  ];

  const form = document.getElementById("reader-form");
  const urlInput = document.getElementById("video-url");
  const apiKeyInput = document.getElementById("api-key");
  const goBtn = document.getElementById("go-btn");
  const progressText = document.getElementById("progress-text");
  const statusEl = document.getElementById("status");
  const backendTargetEl = document.getElementById("backend-target");
  const copyBtn = document.getElementById("copy-btn");
  const downloadBtn = document.getElementById("download-btn");
  const transcriptEl = document.getElementById("transcript-text");
  const captionEl = document.getElementById("caption-text");
  const stepsListEl = document.getElementById("steps-list");
  const stepsEmptyEl = document.getElementById("steps-empty");
  const recipeEl = document.getElementById("recipe-text");

  const modeLinkBtn = document.getElementById("mode-link");
  const modeUploadBtn = document.getElementById("mode-upload");
  const panelLink = document.getElementById("panel-link");
  const panelUpload = document.getElementById("panel-upload");
  const fileInput = document.getElementById("video-file");
  const fileMetaEl = document.getElementById("file-meta");
  const uploadBtn = document.getElementById("upload-btn");
  const uploadProgressWrap = document.getElementById("upload-progress-wrap");
  const uploadProgressBar = document.getElementById("upload-progress-bar");
  const uploadProgressLabel = document.getElementById("upload-progress-label");

  let currentPrompt = "";
  let progressTimer = null;
  let progressValue = 6;
  let activeMode = "link";
  let selectedFile = null;
  let uploadXhr = null;
  let linkDownloadToken = "";
  let uploadDownloadFile = null;

  const cfg = root.REEL_READER_CONFIG || {};
  const backendUrl = String(cfg.backendUrl || "").trim();
  const maxUploadBytes = Number(cfg.maxUploadBytes) > 0 ? Number(cfg.maxUploadBytes) : 104857600;

  backendTargetEl.textContent = backendUrl
    ? "Backend: " + backendUrl
    : "Backend not configured yet. Ask Brandon to set reelreader/config.js backendUrl.";

  apiKeyInput.value = root.localStorage.getItem(STORAGE_KEY) || "";
  apiKeyInput.addEventListener("change", function () {
    root.localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
  });

  modeLinkBtn.addEventListener("click", function () { setMode("link"); });
  modeUploadBtn.addEventListener("click", function () { setMode("upload"); });

  copyBtn.addEventListener("click", function () {
    if (!currentPrompt) return;
    copyText(currentPrompt)
      .then(function () { notify("Prompt copied."); })
      .catch(function () { notify("Copy failed. Select and copy manually.", true); });
  });

  downloadBtn.addEventListener("click", function () {
    if (activeMode === "upload" && uploadDownloadFile) {
      saveLocalFile(uploadDownloadFile);
      return;
    }
    if (linkDownloadToken) {
      downloadFromServer(linkDownloadToken);
    }
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    runLinkReader();
  });

  fileInput.addEventListener("change", function () {
    selectedFile = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    renderFileMeta(selectedFile);
    uploadBtn.disabled = !selectedFile;
  });

  uploadBtn.addEventListener("click", function () {
    runUploadReader();
  });

  function setMode(mode) {
    activeMode = mode === "upload" ? "upload" : "link";
    const isLink = activeMode === "link";
    modeLinkBtn.classList.toggle("is-active", isLink);
    modeUploadBtn.classList.toggle("is-active", !isLink);
    modeLinkBtn.setAttribute("aria-selected", isLink ? "true" : "false");
    modeUploadBtn.setAttribute("aria-selected", isLink ? "false" : "true");
    panelLink.hidden = !isLink;
    panelUpload.hidden = isLink;
    setStatus("", false);
  }

  function renderFileMeta(file) {
    if (!file) {
      fileMetaEl.textContent = "No file selected.";
      fileMetaEl.classList.add("empty");
      return;
    }
    fileMetaEl.classList.remove("empty");
    fileMetaEl.textContent = file.name + " · " + formatBytes(file.size);
    if (file.size > maxUploadBytes) {
      fileMetaEl.textContent += " (over the " + formatBytes(maxUploadBytes) + " upload limit — trim it or pick a shorter clip)";
      uploadBtn.disabled = true;
    }
  }

  function runLinkReader() {
    const value = urlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    if (!ensureReady(apiKey)) return;
    if (!isSupportedUrl(value)) {
      setStatus("Paste a valid Instagram, TikTok or YouTube URL.", true);
      return;
    }

    root.localStorage.setItem(STORAGE_KEY, apiKey);
    setLinkLoading(true);
    clearOutput();
    setStatus("Submitting video for analysis...", false);

    fetch(withApiPath(backendUrl, "/api/reel-reader"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reel-reader-key": apiKey
      },
      body: JSON.stringify({ url: value })
    })
      .then(parseJsonResponse)
      .then(function (payload) {
        renderResult(payload || {});
        setStatus("Done.", false);
      })
      .catch(function (error) {
        setStatus(error.message || "Request failed.", true);
      })
      .finally(function () {
        setLinkLoading(false);
      });
  }

  function runUploadReader() {
    const apiKey = apiKeyInput.value.trim();
    if (!ensureReady(apiKey)) return;
    if (!selectedFile) {
      setStatus("Choose a video file first.", true);
      return;
    }
    if (selectedFile.size > maxUploadBytes) {
      setStatus("This video is " + formatBytes(selectedFile.size) + ". The upload limit is " + formatBytes(maxUploadBytes) + ". Trim it or pick a shorter clip.", true);
      return;
    }

    root.localStorage.setItem(STORAGE_KEY, apiKey);
    clearOutput();
    setUploadBusy(true);
    setStatus("Uploading video…", false);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("video", selectedFile, selectedFile.name);

    const xhr = new XMLHttpRequest();
    uploadXhr = xhr;
    xhr.open("POST", withApiPath(backendUrl, "/api/reel-reader/upload"));
    xhr.setRequestHeader("x-reel-reader-key", apiKey);
    xhr.responseType = "json";

    xhr.upload.addEventListener("progress", function (event) {
      if (!event.lengthComputable) return;
      const pct = Math.min(100, Math.round((event.loaded / event.total) * 100));
      setUploadProgress(pct);
      setStatus(pct < 100 ? "Uploading video… " + pct + "%" : "Analyzing upload…", false);
    });

    xhr.addEventListener("load", function () {
      uploadXhr = null;
      const payload = xhr.response || {};
      if (xhr.status >= 200 && xhr.status < 300) {
        renderResult(payload);
        setUploadProgress(100);
        setStatus("Done.", false);
        setUploadBusy(false);
        return;
      }
      const message = payload.error && payload.error.message
        ? payload.error.message
        : "Upload failed with HTTP " + xhr.status + ".";
      setStatus(message, true);
      setUploadBusy(false);
    });

    xhr.addEventListener("error", function () {
      uploadXhr = null;
      setStatus("Upload failed. Check your connection and try again.", true);
      setUploadBusy(false);
    });

    xhr.addEventListener("abort", function () {
      uploadXhr = null;
      setStatus("Upload cancelled.", true);
      setUploadBusy(false);
    });

    xhr.send(formData);
  }

  function ensureReady(apiKey) {
    if (!backendUrl) {
      setStatus("Reel Reader backend is not configured yet. Enter backendUrl in reelreader/config.js.", true);
      return false;
    }
    if (!apiKey) {
      setStatus("Enter the service API key in Settings first.", true);
      apiKeyInput.focus();
      return false;
    }
    return true;
  }

  function parseJsonResponse(response) {
    return response.json().catch(function () { return {}; }).then(function (payload) {
      if (!response.ok) {
        const message = payload && payload.error && payload.error.message
          ? payload.error.message
          : "Request failed with HTTP " + response.status + ".";
        throw new Error(message);
      }
      return payload;
    });
  }

  function renderResult(payload) {
    const transcript = textValue(payload.transcript);
    const caption = textValue(payload.caption);
    const steps = Array.isArray(payload.steps) ? payload.steps.filter(Boolean) : [];
    const recipe = payload.recipe || null;

    transcriptEl.textContent = transcript || "No transcript returned.";
    transcriptEl.classList.toggle("empty", !transcript);

    captionEl.textContent = caption || "No on-screen text returned.";
    captionEl.classList.toggle("empty", !caption);

    stepsListEl.innerHTML = "";
    if (steps.length) {
      steps.forEach(function (step) {
        const li = document.createElement("li");
        li.textContent = step;
        stepsListEl.appendChild(li);
      });
      stepsEmptyEl.hidden = true;
    } else {
      stepsEmptyEl.hidden = false;
      stepsEmptyEl.textContent = "No steps returned.";
    }

    const recipeText = recipe ? formatRecipe(recipe) : "Not a recipe video (recipe = null).";
    recipeEl.textContent = recipeText;
    recipeEl.classList.toggle("empty", !recipe);

    currentPrompt = textValue(payload.prompt) || buildFallbackPrompt(transcript, caption, steps, recipeText);
    copyBtn.disabled = !currentPrompt;

    linkDownloadToken = textValue(payload.downloadToken);
    if (activeMode === "upload" && selectedFile) {
      uploadDownloadFile = selectedFile;
      showDownloadButton(true);
    } else if (linkDownloadToken) {
      uploadDownloadFile = null;
      showDownloadButton(true);
    } else {
      uploadDownloadFile = null;
      linkDownloadToken = "";
      showDownloadButton(false);
    }
  }

  function clearOutput() {
    currentPrompt = "";
    copyBtn.disabled = true;
    linkDownloadToken = "";
    uploadDownloadFile = null;
    showDownloadButton(false);
    transcriptEl.textContent = "Working...";
    captionEl.textContent = "Working...";
    stepsListEl.innerHTML = "";
    stepsEmptyEl.hidden = false;
    stepsEmptyEl.textContent = "Working...";
    recipeEl.textContent = "Working...";
    transcriptEl.classList.remove("empty");
    captionEl.classList.remove("empty");
    recipeEl.classList.remove("empty");
  }

  function setLinkLoading(on) {
    goBtn.disabled = on;
    uploadBtn.disabled = on || !selectedFile;
    if (on) {
      progressValue = 6;
      progressText.textContent = "Preparing… " + progressValue + "%";
      progressTimer = root.setInterval(function () {
        progressValue = Math.min(94, progressValue + (progressValue < 60 ? 7 : 3));
        progressText.textContent = progressValue >= 94 ? "Finalizing…" : "Analyzing… " + progressValue + "%";
      }, 700);
    } else {
      if (progressTimer) root.clearInterval(progressTimer);
      progressTimer = null;
      progressText.textContent = "";
      uploadBtn.disabled = !selectedFile;
    }
  }

  function setUploadBusy(on) {
    goBtn.disabled = on;
    uploadBtn.disabled = on || !selectedFile;
    fileInput.disabled = on;
    modeLinkBtn.disabled = on;
    modeUploadBtn.disabled = on;
    uploadProgressWrap.hidden = !on;
    if (!on) {
      setUploadProgress(0);
      uploadProgressWrap.hidden = true;
    }
  }

  function setUploadProgress(pct) {
    uploadProgressWrap.hidden = false;
    uploadProgressBar.style.width = Math.max(0, Math.min(100, pct)) + "%";
    uploadProgressLabel.textContent = pct < 100 ? "Uploading… " + pct + "%" : "Analyzing…";
  }

  function setStatus(message, isError) {
    statusEl.textContent = message;
    statusEl.classList.toggle("error", !!isError);
  }

  function notify(message, isError) {
    if (root.NDUI && typeof root.NDUI.toast === "function") {
      root.NDUI.toast(message);
      return;
    }
    setStatus(message, !!isError);
  }

  function withApiPath(base, suffix) {
    const trimmed = base.replace(/\/+$/, "");
    return trimmed + suffix;
  }

  function isSupportedUrl(value) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
      return ALLOWED_HOSTS.indexOf(parsed.hostname.toLowerCase()) !== -1;
    } catch (error) {
      return false;
    }
  }

  function textValue(value) {
    if (value == null) return "";
    return String(value).trim();
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + " MB";
  }

  function formatRecipe(recipe) {
    const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    const method = Array.isArray(recipe.method) ? recipe.method : [];
    let out = "";
    if (ingredients.length) {
      out += "Ingredients:\n";
      ingredients.forEach(function (item) {
        if (!item) return;
        const name = textValue(item.item || item.name);
        const quantity = textValue(item.quantity);
        if (!name && !quantity) return;
        out += "- " + (quantity ? quantity + " " : "") + name + "\n";
      });
    }
    if (method.length) {
      if (out) out += "\n";
      out += "Method:\n";
      method.forEach(function (step, index) {
        out += (index + 1) + ". " + textValue(step) + "\n";
      });
    }
    return out.trim() || "Recipe data returned but was empty.";
  }

  function buildFallbackPrompt(transcript, caption, steps, recipeText) {
    return [
      "Transcript:",
      transcript || "(none)",
      "",
      "On-screen text / caption:",
      caption || "(none)",
      "",
      "Step-by-step:",
      steps.length ? steps.map(function (step, i) { return (i + 1) + ". " + step; }).join("\n") : "(none)",
      "",
      "Recipe details:",
      recipeText
    ].join("\n");
  }

  function showDownloadButton(on) {
    downloadBtn.hidden = !on;
    downloadBtn.disabled = !on;
  }

  function saveLocalFile(file) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name || "reel-reader-video.mp4";
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    notify("Video download started.");
  }

  function downloadFromServer(token) {
    const apiKey = apiKeyInput.value.trim();
    if (!ensureReady(apiKey)) return;
    downloadBtn.disabled = true;
    setStatus("Preparing video download…", false);

    fetch(withApiPath(backendUrl, "/api/reel-reader/download/" + encodeURIComponent(token)), {
      method: "GET",
      headers: { "x-reel-reader-key": apiKey }
    })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (payload) {
            const message = payload.error && payload.error.message
              ? payload.error.message
              : "Download failed with HTTP " + response.status + ".";
            throw new Error(message);
          });
        }
        return response.blob();
      })
      .then(function (blob) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "reel-reader-video.mp4";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        linkDownloadToken = "";
        showDownloadButton(false);
        setStatus("Video downloaded.", false);
        notify("Video download started.");
      })
      .catch(function (error) {
        setStatus(error.message || "Download failed.", true);
        downloadBtn.disabled = false;
      });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.left = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        if (document.execCommand("copy")) resolve();
        else reject(new Error("copy failed"));
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }
})(window);
