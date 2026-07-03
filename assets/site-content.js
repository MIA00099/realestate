(function() {
  const contentUrl = '/data/content.json';

  document.addEventListener('DOMContentLoaded', function() {
    fetch(contentUrl, { cache: 'no-store' })
      .then(function(response) {
        if (!response.ok) throw new Error('Content unavailable');
        return response.json();
      })
      .then(applyContent)
      .catch(function() {
        // Static file viewing still works without the admin server.
      });
  });

  function applyContent(content) {
    const services = content && content.services ? content.services : {};
    const partners = Array.isArray(content && content.partners) ? content.partners : [];
    if (!Object.keys(services).length && !partners.length) return;
    ensureManagedStyles();
    updateHomeCards(services);
    renderPartners(content);
    updateServicePage(services);
  }

  function updateHomeCards(services) {
    document.querySelectorAll('.core-service-item[href], .project[href]').forEach(function(card) {
      const service = serviceFromHref(card.getAttribute('href'), services);
      if (!service) return;

      const title = card.querySelector('h3, h4');
      const summary = card.querySelector('p');
      const image = card.querySelector('img');

      if (title) title.textContent = service.title || title.textContent;
      if (summary) summary.textContent = service.summary || summary.textContent;
      if (image && service.heroImage) {
        image.src = service.heroImage;
        image.alt = service.title || image.alt || 'Service image';
      }
    });
  }

  function updateServicePage(services) {
    const slug = currentSlug();
    const service = services[slug];
    if (!service) return;

    const pageTitle = service.heroTitle || service.title || 'Service';
    document.title = `${pageTitle} | Menu Real Estate Group`;
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription && service.summary) metaDescription.setAttribute('content', service.summary);

    const hero = document.querySelector('.service-page-hero');
    if (hero && service.heroImage) hero.style.setProperty('--service-bg', `url("${cssUrl(service.heroImage)}")`);

    setText('.service-page-hero .eyebrow', service.category);
    setText('.service-page-hero h1', pageTitle);
    setText('.service-page-hero p', service.summary);
    setText('.service-panel h2 + p', service.description);
    setText('.service-side-card h3', service.title);
    setText('.service-side-card p', service.sideSummary || service.summary);

    const breadcrumb = document.querySelector('.breadcrumb');
    if (breadcrumb) {
      breadcrumb.innerHTML = `<a href="../index.html">Home</a> / <a href="../index.html#core-services">Services</a> / ${escapeHtml(service.title || 'Service')}`;
    }

    const sideImage = document.querySelector('.service-side-card img');
    const heroImage = service.heroImage || firstImage(service);
    if (sideImage && heroImage) {
      sideImage.src = heroImage;
      sideImage.alt = `${service.title || 'Service'} preview`;
    }

    renderServiceImages(service);
  }

  function renderServiceImages(service) {
    const grid = document.querySelector('.service-image-grid');
    const images = Array.isArray(service.images) ? service.images.filter(function(image) { return image && image.src; }) : [];
    if (!grid || !images.length) return;

    grid.classList.add('managed-service-gallery');
    grid.innerHTML = images.map(function(image) {
      const alt = image.alt || service.title || 'Service image';
      const caption = image.caption ? `<figcaption>${escapeHtml(image.caption)}</figcaption>` : '';
      return `<figure><img src="${escapeAttr(image.src)}" alt="${escapeAttr(alt)}" loading="lazy">${caption}</figure>`;
    }).join('');
  }

  function renderPartners(content) {
    const section = document.getElementById('partners');
    const grid = document.getElementById('partnersGrid');
    const navLink = document.querySelector('[data-partners-nav]');
    if (!section && !grid && !navLink) return;

    const partners = (Array.isArray(content.partners) ? content.partners : []).filter(function(partner) {
      return partner && partner.name && partner.role && partner.image;
    });
    if (!partners.length) {
      if (section) section.hidden = true;
      if (navLink) navLink.hidden = true;
      return;
    }

    if (section) section.hidden = false;
    if (navLink) navLink.hidden = false;
    if (!grid) return;

    const phone = content.companyPhone || '+250 782 616 150';
    grid.innerHTML = partners.map(function(partner) {
      return `
        <article class="partner-card">
          <img src="${escapeAttr(partner.image)}" alt="${escapeAttr(partner.name)} profile" loading="lazy">
          <div class="partner-card-body">
            <h3>${escapeHtml(partner.name)}</h3>
            <p class="partner-role">${escapeHtml(partner.role)}</p>
            <a class="partner-phone" href="tel:${escapeAttr(phoneHref(phone))}">Call MENU: ${escapeHtml(phone)}</a>
          </div>
        </article>
      `;
    }).join('');
  }

  function serviceFromHref(href, services) {
    if (!href) return null;
    const slug = href.split('#')[0].split('?')[0].split('/').pop().replace(/\.html$/, '');
    return services[slug] || null;
  }

  function currentSlug() {
    return window.location.pathname.split('/').pop().replace(/\.html$/, '');
  }

  function firstImage(service) {
    const images = Array.isArray(service.images) ? service.images : [];
    const image = images.find(function(item) { return item && item.src; });
    return image ? image.src : '';
  }

  function setText(selector, value) {
    const node = document.querySelector(selector);
    if (node && value) node.textContent = value;
  }

  function cssUrl(value) {
    return String(value || '').replace(/"/g, '%22').replace(/\n/g, '');
  }

  function phoneHref(value) {
    return String(value || '').replace(/[^\d+]/g, '') || '+250782616150';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function(char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, '&#096;');
  }

  function ensureManagedStyles() {
    if (document.getElementById('managedContentStyles')) return;
    const style = document.createElement('style');
    style.id = 'managedContentStyles';
    style.textContent = [
      '.managed-service-gallery{grid-template-columns:repeat(auto-fit,minmax(220px,1fr));}',
      '.managed-service-gallery figure{margin:0;}',
      '.managed-service-gallery img{height:320px;width:100%;object-fit:cover;cursor:pointer;border-radius:24px;box-shadow:0 16px 38px rgba(7,29,51,0.14);}',
      '.managed-service-gallery figcaption{margin-top:8px;color:#6b7280;font-size:14px;font-weight:700;}'
    ].join('');
    document.head.appendChild(style);
  }

  function initLightbox() {
    var overlay = document.createElement('div');
    overlay.id = 'imageLightbox';
    overlay.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);z-index:9999;cursor:pointer;align-items:center;justify-content:center;';
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) { overlay.style.display = 'none'; document.body.style.overflow = ''; }
    });
    var img = document.createElement('img');
    img.style.cssText = 'max-width:90%;max-height:90%;object-fit:contain;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.5);cursor:default;';
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    document.addEventListener('click', function(e) {
      var imgEl = e.target.closest('img');
      if (!imgEl) return;
      var container = imgEl.closest('.service-image-grid, .managed-service-gallery, .project, .service-side-card, .hero-card, .partner-card');
      if (!container) return;
      img.src = imgEl.src;
      overlay.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && overlay.style.display === 'flex') {
        overlay.style.display = 'none';
        document.body.style.overflow = '';
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
  } else {
    initLightbox();
  }
})();
