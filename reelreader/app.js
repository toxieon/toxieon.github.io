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
  const transcriptEl = document.getElementById("transcript-text");
  const captionEl = document.getElementById("caption-text");
  const stepsListEl = document.getElementById("steps-list");
  const stepsEmptyEl = document.getElementById("steps-empty");
  const recipeEl = document.getElementById("recipe-text");

  let currentPrompt = "";
  let progressTimer = null;
  let progressValue = 6;

  const backendUrl = String((root.REEL_READER_CONFIG && root.REEL_READER_CONFIG.backendUrl) || "").trim();
  backendTargetEl.textContent = backendUrl
    ? "Backend: " + backendUrl
    : "Backend not configured yet. Ask Brandon to set reelreader/config.js backendUrl.";

  apiKeyInput.value = root.localStorage.getItem(STORAGE_KEY) || "";
  apiKeyInput.addEventListener("change", function () {
    root.localStorage.setItem(STORAGE_KEY, apiKeyInput.value.trim());
  });

  copyBtn.addEventListener("click", function () {
    if (!currentPrompt) return;
    copyText(currentPrompt)
      .then(function () { notify("Prompt copied."); })
      .catch(function () { notify("Copy failed. Select and copy manually.", true); });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    runReader();
  });

  function runReader() {
    const value = urlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();

    if (!backendUrl) {
      setStatus("Reel Reader backend is not configured yet. Enter backendUrl in reelreader/config.js.", true);
      return;
    }
    if (!apiKey) {
      setStatus("Enter the service API key in Settings first.", true);
      apiKeyInput.focus();
      return;
    }
    if (!isSupportedUrl(value)) {
      setStatus("Paste a valid Instagram, TikTok or YouTube URL.", true);
      return;
    }

    root.localStorage.setItem(STORAGE_KEY, apiKey);
    setLoading(true);
    clearOutput();
    setStatus("Submitting video for analysis...", false);

    fetch(withApiPath(backendUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-reel-reader-key": apiKey
      },
      body: JSON.stringify({ url: value })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (payload) {
          if (!response.ok) {
            const message = payload && payload.error && payload.error.message
              ? payload.error.message
              : "Request failed with HTTP " + response.status + ".";
            throw new Error(message);
          }
          return payload;
        });
      })
      .then(function (payload) {
        renderResult(payload || {});
        setStatus("Done.", false);
      })
      .catch(function (error) {
        setStatus(error.message || "Request failed.", true);
      })
      .finally(function () {
        setLoading(false);
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
  }

  function clearOutput() {
    currentPrompt = "";
    copyBtn.disabled = true;
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

  function setLoading(on) {
    goBtn.disabled = on;
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
    }
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

  function withApiPath(base) {
    const trimmed = base.replace(/\/+$/, "");
    return trimmed + "/api/reel-reader";
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
