/**
 * Progressive audio loading utilities
 * Implements chunked/streaming audio loading for better performance
 */

/**
 * Load audio progressively using Range requests
 * This allows the browser to start playing audio before the entire file is downloaded
 * 
 * @param audioUrl - URL to the audio file
 * @param audioElement - HTMLAudioElement to load the audio into
 * @param onProgress - Optional callback for loading progress
 * @returns Promise that resolves when audio is ready to play
 */
export async function loadAudioProgressively(
  audioUrl: string,
  audioElement: HTMLAudioElement,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  try {
    // Set preload to auto for progressive loading
    audioElement.preload = "auto";
    
    // For audio files, browsers handle Range requests automatically
    // We just need to set the src and let the browser handle chunked loading
    audioElement.src = audioUrl;
    
    // Wait for enough data to be loaded to start playback
    return new Promise<void>((resolve, reject) => {
      let hasResolved = false;
      
      const handleCanPlay = () => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          resolve();
        }
      };
      
      const handleCanPlayThrough = () => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          resolve();
        }
      };
      
      const handleProgress = () => {
        if (audioElement.buffered.length > 0 && onProgress) {
          const bufferedEnd = audioElement.buffered.end(audioElement.buffered.length - 1);
          const duration = audioElement.duration || 0;
          if (duration > 0) {
            onProgress(bufferedEnd, duration);
          }
        }
      };
      
      const handleError = () => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          reject(new Error("Failed to load audio"));
        }
      };
      
      const cleanup = () => {
        audioElement.removeEventListener("canplay", handleCanPlay);
        audioElement.removeEventListener("canplaythrough", handleCanPlayThrough);
        audioElement.removeEventListener("progress", handleProgress);
        audioElement.removeEventListener("error", handleError);
      };
      
      audioElement.addEventListener("canplay", handleCanPlay, { once: true });
      audioElement.addEventListener("canplaythrough", handleCanPlayThrough, { once: true });
      audioElement.addEventListener("progress", handleProgress);
      audioElement.addEventListener("error", handleError, { once: true });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          cleanup();
          // If we have some data loaded, resolve anyway
          if (audioElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            resolve();
          } else {
            reject(new Error("Timeout loading audio"));
          }
        }
      }, 10000);
    });
  } catch (error) {
    console.error("Error in progressive audio loading:", error);
    throw error;
  }
}

/**
 * Prefetch audio metadata without loading the full file
 * Useful for getting duration and other metadata quickly
 * 
 * @param audioUrl - URL to the audio file
 * @returns Promise resolving to audio metadata
 */
export async function prefetchAudioMetadata(audioUrl: string): Promise<{
  duration: number;
  ready: boolean;
}> {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata"; // Only load metadata, not the full file
    
    const handleLoadedMetadata = () => {
      resolve({
        duration: audio.duration,
        ready: true,
      });
      cleanup();
    };
    
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load audio metadata"));
    };
    
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("error", handleError);
      audio.src = "";
    };
    
    audio.addEventListener("loadedmetadata", handleLoadedMetadata, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    
    audio.src = audioUrl;
    
    // Timeout after 5 seconds
    setTimeout(() => {
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve({
          duration: audio.duration,
          ready: true,
        });
        cleanup();
      } else {
        cleanup();
        reject(new Error("Timeout loading audio metadata"));
      }
    }, 5000);
  });
}

/**
 * Load audio in chunks for very large files
 * This is a more advanced implementation that manually handles Range requests
 * Note: Most browsers handle this automatically, but this gives more control
 * 
 * @param audioUrl - URL to the audio file
 * @param chunkSize - Size of each chunk in bytes (default: 1MB)
 * @returns AsyncGenerator that yields audio chunks
 */
export async function* loadAudioInChunks(
  audioUrl: string,
  chunkSize: number = 1024 * 1024 // 1MB chunks
): AsyncGenerator<ArrayBuffer, void, unknown> {
  try {
    // First, get the total file size
    const headResponse = await fetch(audioUrl, { method: "HEAD" });
    const contentLength = parseInt(headResponse.headers.get("Content-Length") || "0", 10);
    
    if (contentLength === 0) {
      // If we can't get the size, just fetch the whole file
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      yield arrayBuffer;
      return;
    }
    
    // Load in chunks
    let start = 0;
    while (start < contentLength) {
      const end = Math.min(start + chunkSize - 1, contentLength - 1);
      
      const response = await fetch(audioUrl, {
        headers: {
          Range: `bytes=${start}-${end}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chunk: ${response.statusText}`);
      }
      
      const arrayBuffer = await response.arrayBuffer();
      yield arrayBuffer;
      
      start = end + 1;
    }
  } catch (error) {
    console.error("Error loading audio in chunks:", error);
    throw error;
  }
}

