(function () {
  async function getMediaSessionMetadata() {
    try {
      if (!navigator.mediaSession) {
        console.log("[Radio Broadcaster] Navigator.mediaSession not available");
        return null;
      }

      if (!navigator.mediaSession.metadata) {
        console.log("[Radio Broadcaster] No MediaSession metadata available");
        return null;
      }

      const metadata = navigator.mediaSession.metadata;
      const chooseAlbumArt = window.__collabfmAlbumArt?.chooseAlbumArt;
      const albumArt = chooseAlbumArt ? await chooseAlbumArt(metadata.artwork) : null;

      let title = String(metadata.title || "").trim();
      let artist = String(metadata.artist || "").trim();

      // Some players omit artist briefly or embed it in the title ("Track · Artist").
      if (!artist && title.includes(" · ")) {
        const parts = title.split(" · ").map((part) => part.trim()).filter(Boolean);
        if (parts.length >= 2) {
          artist = parts.pop() || "";
          title = parts.join(" · ");
        }
      }
      if (!artist && String(metadata.album || "").trim()) {
        artist = String(metadata.album).trim();
      }

      console.log("[Radio Broadcaster] Raw MediaSession metadata:", {
        title,
        artist,
        album: metadata.album,
        artworkCount: metadata.artwork ? metadata.artwork.length : 0,
        albumArt,
      });

      if (title && artist) {
        console.log("[Radio Broadcaster] Valid metadata detected:", { title, artist, albumArt });
        return { title, artist, albumArt };
      }

      console.log("[Radio Broadcaster] Metadata found but missing title/artist or empty:", {
        hasTitle: !!title,
        titleValue: title,
        hasArtist: !!artist,
        artistValue: artist,
      });

      return null;
    } catch (error) {
      console.error("[Radio Broadcaster] Error getting MediaSession metadata:", error);
      return null;
    }
  }

  function bindMediaSessionMetadataEvents(onMetadataChange) {
    if (!navigator.mediaSession || bindMediaSessionMetadataEvents.bound) return;
    bindMediaSessionMetadataEvents.bound = true;
    try {
      navigator.mediaSession.addEventListener("metadatachange", () => {
        void onMetadataChange();
      });
    } catch {}
  }

  window.__collabfmMediaSession = {
    getMediaSessionMetadata,
    bindMediaSessionMetadataEvents,
  };
})();
