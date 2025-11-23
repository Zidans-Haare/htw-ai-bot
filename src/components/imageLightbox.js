
import { scrollToBottom } from './ui.js'; // If needed, but probably not

export function processImagesInBubble(bubble) {
  const images = bubble.querySelectorAll('img');
  images.forEach(async img => {
    // Skip if the image has already been processed
    if (img.dataset.fullSrc) {
      return;
    }

    const originalSrc = img.src;
    let pathname;
    try {
      const url = new URL(originalSrc);
      pathname = url.pathname;
    } catch (e) {
      // If not a valid URL, assume it's relative and use as is
      pathname = originalSrc;
    }

    if (!pathname.startsWith('/uploads/images/')) return; // Only handle our uploads

    img.dataset.fullSrc = originalSrc; // Store original for lightbox
    img.style.cursor = 'pointer'; // Indicate clickable
    //img.alt = img.alt || 'AI-generated image'; // Accessibility
    img.tabIndex = 0; // Make tabbable

    // Measure bubble width after insertion
    const resizeImage = () => {
      const bubbleWidth = bubble.clientWidth;
      if (bubbleWidth > 0) {
        const roundedWidth = Math.floor(bubbleWidth / 20) * 20; // Round down to nearest multiple of 20px
        const fileName = pathname.split('/').pop();
        const baseName = fileName.split('.').shift();
        const ext = fileName.split('.').pop();
        img.src = `/uploads/images/${baseName}_${roundedWidth}px.${ext}`;
      }
    };

    // Initial resize
    resizeImage();

    // Resize on window resize (debounced)
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeImage, 200);
    });

    // Lightbox click and keydown (for accessibility)
    img.addEventListener('click', () => openLightbox(originalSrc));
    img.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openLightbox(originalSrc);
      }
    });

    // Fetch and display source inline (overlay)
    try {
      const filename = pathname.split('/').pop();
      const response = await fetch(`/api/public/images/${filename}/meta`);
      if (response.ok) {
        const data = await response.json();
        if (data.source) {
          // Create wrapper
          const wrapper = document.createElement('div');
          wrapper.style.position = 'relative';
          wrapper.style.display = 'inline-block'; // Or block, depending on layout
          wrapper.style.maxWidth = '100%';

          // Insert wrapper before image
          if (img.parentNode) {
            img.parentNode.insertBefore(wrapper, img);
            wrapper.appendChild(img);
          }

          const sourceDiv = document.createElement('div');
          sourceDiv.textContent = `Quelle: ${data.source}`;
          sourceDiv.style.position = 'absolute';
          sourceDiv.style.bottom = '0';
          sourceDiv.style.left = '0';
          sourceDiv.style.width = '100%';
          sourceDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
          sourceDiv.style.color = 'white';
          sourceDiv.style.padding = '4px 8px';
          sourceDiv.style.fontSize = '0.75rem';
          sourceDiv.style.boxSizing = 'border-box';
          sourceDiv.style.borderBottomLeftRadius = getComputedStyle(img).borderBottomLeftRadius;
          sourceDiv.style.borderBottomRightRadius = getComputedStyle(img).borderBottomRightRadius;
          sourceDiv.style.pointerEvents = 'none'; // Let clicks pass through to image (lightbox)

          wrapper.appendChild(sourceDiv);
        }
      }
    } catch (e) {
      console.error('Failed to fetch image source for inline display', e);
    }
  });
}

export async function openLightbox(src) {
  let filename;
  try {
    const url = new URL(src, window.location.origin);
    filename = url.pathname.split('/').pop();
  } catch (e) {
    filename = src.split('/').pop();
  }

  let sourceText = '';
  if (filename) {
    try {
      const response = await fetch(`/api/public/images/${filename}/meta`);
      if (response.ok) {
        const data = await response.json();
        if (data.source) {
          sourceText = `Quelle: ${data.source}`;
        }
      }
    } catch (e) {
      console.error('Failed to fetch image metadata', e);
    }
  }

  const lightbox = document.createElement('div');
  lightbox.id = 'lightbox';
  lightbox.className = 'lightbox';
  lightbox.innerHTML = `
    <div class="lightbox-content" style="position: relative; display: flex; flex-direction: column; align-items: center;">
      <img src="${src}" alt="Full image" style="max-height: 85vh;">
      ${sourceText ? `<div class="lightbox-source" style="margin-top: 10px; color: white; font-size: 14px; text-align: center;">${sourceText}</div>` : ''}
      <button class="lightbox-close">&times;</button>
    </div>
  `;
  document.body.appendChild(lightbox);

  lightbox.addEventListener('click', closeLightbox);
  lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  document.addEventListener('keydown', handleLightboxKeydown);
  lightbox.querySelector('img').focus(); // Accessibility: focus on image
}

export function closeLightbox(e) {
  if (e && (e.target.id !== 'lightbox' && !e.target.classList.contains('lightbox-close'))) return;
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.remove();
    document.removeEventListener('keydown', handleLightboxKeydown);
  }
}

function handleLightboxKeydown(e) {
  if (e.key === 'Escape') closeLightbox();
}
