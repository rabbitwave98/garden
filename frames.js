  const iframe = document.getElementById("frames");

  function resizeIframe() {
    const doc = iframe.contentDocument;
    if (!doc) return;

    iframe.style.height =
      doc.documentElement.scrollHeight + "px";
  }

  iframe.addEventListener("load", resizeIframe);

  window.addEventListener("resize", resizeIframe);