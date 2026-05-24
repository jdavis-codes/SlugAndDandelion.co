document.addEventListener('DOMContentLoaded', function () {
  const photos = document.querySelectorAll('.employee-photo');
  photos.forEach((img) => {
    const alt = img.dataset.alt;
    if (!alt) return;
    const original = img.src;

    // Desktop hover
    img.addEventListener('mouseenter', () => { img.src = alt; });
    img.addEventListener('mouseleave', () => { if (img.dataset.toggled !== 'true') img.src = original; });

    // Click / touch: toggle to alternate image (useful on mobile)
    img.addEventListener('click', (e) => {
      const toggled = img.dataset.toggled === 'true';
      if (toggled) {
        img.src = original;
        img.dataset.toggled = 'false';
      } else {
        img.src = alt;
        img.dataset.toggled = 'true';
      }
    });
  });
});
