import { useMemo } from "react";
import { useValidatedRemoteImage } from "../hooks/useValidatedRemoteImage";
import { imageFallbackHandler } from "../utils/brandingImage";
import { proceduralAlbumArt } from "../utils/proceduralArt";

interface AlbumArtImageProps {
  remoteUrl?: string | null;
  title: string;
  artist: string;
  size?: number;
  className?: string;
  alt?: string;
}

export function AlbumArtImage({
  remoteUrl,
  title,
  artist,
  size = 192,
  className = "",
  alt = "Album artwork",
}: AlbumArtImageProps) {
  const fallbackSrc = useMemo(
    () => proceduralAlbumArt(title, artist, size),
    [title, artist, size],
  );
  const { placeholderSrc, remoteSrc } = useValidatedRemoteImage(remoteUrl, fallbackSrc);
  const onRemoteError = imageFallbackHandler(placeholderSrc, { retryOnce: false });

  if (!remoteUrl?.trim() || remoteUrl.startsWith("data:")) {
    return (
      <img
        alt={alt}
        className={className}
        src={remoteUrl?.startsWith("data:") ? remoteUrl : placeholderSrc}
      />
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <img
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover"
        src={placeholderSrc}
      />
      {remoteSrc ? (
        <img
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          referrerPolicy="no-referrer"
          src={remoteSrc}
          onError={(event) => {
            onRemoteError(event);
            event.currentTarget.remove();
          }}
        />
      ) : null}
    </div>
  );
}
