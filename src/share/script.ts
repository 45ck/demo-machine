export const VIEWER_SCRIPT = `
(() => {
  "use strict";
  const video = document.querySelector("video");
  const chapterButtons = Array.from(document.querySelectorAll("[data-chapter-start]"));
  const transcriptCues = Array.from(document.querySelectorAll("[data-transcript-cue]"));
  const transcriptSearch = document.querySelector("[data-transcript-search]");
  const transcriptStatus = document.querySelector("[data-transcript-status]");
  const copyTranscript = document.querySelector("[data-copy-transcript]");
  const copyLink = document.querySelector("[data-copy-link]");
  const playbackRate = document.querySelector("[data-playback-rate]");
  const endPrompt = document.querySelector("[data-end-prompt]");
  const endPromptTitle = document.querySelector("#end-prompt-title");
  const replay = document.querySelector("[data-replay]");
  const status = document.querySelector("[data-viewer-status]");
  if (!video) return;

  let lastUrlSecond = -1;
  let pendingInitialTime = null;
  let initialTimeApplied = false;
  const announce = (message) => { if (status) status.textContent = message; };
  const chapterStart = (button) => Number(button.dataset.chapterStart || 0);
  const duration = () => Number.isFinite(video.duration) ? video.duration : Number(video.dataset.durationMs || 0) / 1000;
  const clampTime = (seconds) => Math.max(0, Math.min(duration(), seconds));
  const formattedUrlTime = (seconds) => String(Math.round(Math.max(0, seconds) * 10) / 10);

  const readUrlTime = () => {
    try {
      const value = new URL(window.location.href).searchParams.get("t");
      if (value === null) return null;
      const seconds = Number(value);
      return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
    } catch {
      return null;
    }
  };
  pendingInitialTime = readUrlTime();

  const urlAt = (seconds) => {
    const url = new URL(window.location.href);
    url.searchParams.set("t", formattedUrlTime(seconds));
    return url;
  };

  const updateUrl = (seconds, push) => {
    const roundedSecond = Math.floor(Math.max(0, seconds));
    if (!push && roundedSecond === lastUrlSecond) return;
    try {
      const url = urlAt(seconds);
      if (push) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
      lastUrlSecond = roundedSecond;
    } catch {
      // Local file previews may not permit History API updates.
    }
  };

  const activateChapter = () => {
    const currentMs = video.currentTime * 1000;
    let active = chapterButtons[0];
    for (const button of chapterButtons) {
      if (chapterStart(button) <= currentMs + 250) active = button;
    }
    for (const button of chapterButtons) {
      if (button === active) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  };

  const playVideo = () => {
    void video.play().catch(() => announce("Playback is ready. Use the play control to continue."));
  };

  const seekTo = (seconds, push, label, autoplay) => {
    video.currentTime = clampTime(seconds);
    updateUrl(video.currentTime, push);
    activateChapter();
    if (label) announce(label);
    if (autoplay) playVideo();
  };

  const applyInitialTime = () => {
    if (pendingInitialTime !== null) {
      seekTo(pendingInitialTime, false, "Opened shared demo time", false);
    }
    pendingInitialTime = null;
    initialTimeApplied = true;
  };

  const seekBy = (seconds) => seekTo(video.currentTime + seconds, false, "", false);
  const togglePlayback = () => { if (video.paused) playVideo(); else video.pause(); };
  const toggleCaptions = () => {
    const track = video.textTracks && video.textTracks[0];
    if (!track) return;
    track.mode = track.mode === "showing" ? "hidden" : "showing";
    announce(track.mode === "showing" ? "Captions on" : "Captions off");
  };

  const fallbackCopy = (value) => {
    const textarea = document.createElement("textarea");
    textarea.className = "clipboard-fallback";
    textarea.value = value;
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("Copy command was unavailable");
  };

  const copyText = async (value, successMessage) => {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(value);
      } else {
        fallbackCopy(value);
      }
      announce(successMessage);
    } catch {
      announce("Copy failed. Select the text and copy it manually.");
    }
  };

  const transcriptText = () => transcriptCues.map((cue) => {
    const time = cue.querySelector("[data-transcript-start]")?.textContent?.trim() || "";
    const text = cue.querySelector(".cue-text")?.textContent?.trim() || "";
    return (time + " " + text).trim();
  }).filter(Boolean).join("\\n");

  const filterTranscript = () => {
    const query = String(transcriptSearch?.value || "").trim().toLocaleLowerCase();
    let visible = 0;
    for (const cue of transcriptCues) {
      const matches = !query || String(cue.textContent || "").toLocaleLowerCase().includes(query);
      cue.hidden = !matches;
      if (matches) visible += 1;
    }
    if (transcriptStatus) {
      transcriptStatus.textContent = query
        ? String(visible) + " of " + String(transcriptCues.length) + " transcript cues match"
        : String(transcriptCues.length) + " transcript cues";
    }
  };

  const editableTarget = (target) => target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, summary"));

  for (const button of chapterButtons) {
    button.addEventListener("click", () => {
      pendingInitialTime = null;
      initialTimeApplied = true;
      seekTo(chapterStart(button) / 1000, true, "Opened chapter " + (button.dataset.chapterTitle || ""), true);
      video.focus();
    });
  }

  for (const cue of transcriptCues) {
    const button = cue.querySelector("[data-transcript-start]");
    if (!button) continue;
    button.addEventListener("click", () => {
      pendingInitialTime = null;
      initialTimeApplied = true;
      const startMs = Number(button.dataset.transcriptStart || 0);
      seekTo(startMs / 1000, true, "Opened transcript cue at " + (button.textContent || ""), true);
      video.focus();
    });
  }

  transcriptSearch?.addEventListener("input", filterTranscript);
  copyTranscript?.addEventListener("click", () => { void copyText(transcriptText(), "Transcript copied"); });
  copyLink?.addEventListener("click", () => { void copyText(urlAt(video.currentTime).toString(), "Link to current time copied"); });
  playbackRate?.addEventListener("change", () => {
    const rate = Number(playbackRate.value);
    if (!Number.isFinite(rate) || rate <= 0) return;
    video.playbackRate = rate;
    announce("Playback speed " + String(rate) + " times");
  });
  replay?.addEventListener("click", () => {
    if (endPrompt) endPrompt.hidden = true;
    pendingInitialTime = null;
    initialTimeApplied = true;
    seekTo(0, true, "Replaying demo", true);
    video.focus();
  });

  video.addEventListener("timeupdate", () => {
    activateChapter();
    if (initialTimeApplied) updateUrl(video.currentTime, false);
  });
  video.addEventListener("playing", () => { if (endPrompt) endPrompt.hidden = true; });
  video.addEventListener("ended", () => {
    updateUrl(video.currentTime, false);
    if (endPrompt) endPrompt.hidden = false;
    announce("Walkthrough complete. You can explore the product or replay the demo.");
    if (endPromptTitle instanceof HTMLElement) endPromptTitle.focus({ preventScroll: true });
  });
  video.addEventListener("loadedmetadata", () => {
    applyInitialTime();
    activateChapter();
  });
  window.addEventListener("popstate", () => {
    const seconds = readUrlTime();
    if (seconds !== null) {
      pendingInitialTime = null;
      initialTimeApplied = true;
      seekTo(seconds, false, "Opened shared demo time", false);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (editableTarget(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === " " || key === "k") { event.preventDefault(); togglePlayback(); }
    else if (key === "arrowleft") { event.preventDefault(); seekBy(-5); }
    else if (key === "arrowright") { event.preventDefault(); seekBy(5); }
    else if (key === "j") seekBy(-10);
    else if (key === "l") seekBy(10);
    else if (key === "m") { video.muted = !video.muted; announce(video.muted ? "Muted" : "Unmuted"); }
    else if (key === "c") toggleCaptions();
    else if (key === "f" && document.fullscreenEnabled && typeof video.requestFullscreen === "function") {
      void video.requestFullscreen().catch(() => announce("Full screen is unavailable."));
    }
  });

  if (video.readyState >= 1) {
    applyInitialTime();
  }
  filterTranscript();
  activateChapter();
})();
`;
