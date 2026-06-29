(function () {
  function blobToDataUrl(blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  }

  async function chooseAlbumArt(artwork) {
    if (!Array.isArray(artwork) || artwork.length === 0) return null;

    const sorted = [...artwork].sort((a, b) => {
      const aSize = Number.parseInt(String(a?.sizes || "0").split("x")[0], 10) || 0;
      const bSize = Number.parseInt(String(b?.sizes || "0").split("x")[0], 10) || 0;
      return bSize - aSize;
    });

    const durable = sorted.find((item) => {
      const src = String(item?.src || "").trim();
      return src.startsWith("https://") || src.startsWith("http://");
    });

    const inline = sorted.find((item) => {
      const src = String(item?.src || "").trim();
      return src.startsWith("data:image/");
    });

    if (durable?.src) return durable.src;
    if (inline?.src) return inline.src;

    const blobArt = sorted.find((item) => String(item?.src || "").trim().startsWith("blob:"));
    if (blobArt?.src) {
      try {
        const response = await fetch(blobArt.src);
        const blob = await response.blob();
        if (blob.type.startsWith("image/")) return await blobToDataUrl(blob);
      } catch {}
    }

    return null;
  }

  window.__collabfmAlbumArt = { chooseAlbumArt };
})();
