(function() {
  const contentUrl = '/data/content.json';
  let activeGalleryTrigger = null;

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
      const cardImage = service.heroImage || firstImage(service);

      if (title) title.textContent = service.title || title.textContent;
      if (summary) summary.textContent = service.summary || summary.textContent;
      if (image && service.heroImage) {
        image.src = service.heroImage;
        image.alt = service.title || image.alt || 'Service image';
      }

      if (card.classList.contains('core-service-item')) {
        prepareCoreServiceCard(card, service, cardImage);
      }
    });
  }

  function prepareCoreServiceCard(card, service, imageSrc) {
    const copy = card.querySelector('.core-service-icon + div');
    if (copy) copy.classList.add('core-service-copy');

    if (imageSrc && !card.querySelector('.core-service-media')) {
      const media = document.createElement('div');
      media.className = 'core-service-media';
      media.innerHTML = `<img src="${escapeAttr(imageSrc)}" alt="${escapeAttr(service.title || 'Service image')}" loading="lazy">`;
      card.insertBefore(media, card.firstElementChild);
    }

    if (copy && !copy.querySelector('.read-more')) {
      const readMore = document.createElement('span');
      readMore.className = 'read-more';
      readMore.textContent = 'View Full Details';
      copy.appendChild(readMore);
    }
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
    removeRepeatedServiceSidebar();
  }

  function removeRepeatedServiceSidebar() {
    const sideCard = document.querySelector('.service-side-card');
    if (sideCard) sideCard.remove();
  }

  function renderServiceImages(service) {
    const grid = document.querySelector('.service-image-grid');
    const images = Array.isArray(service.images) ? service.images.filter(function(image) { return image && image.src; }) : [];
    if (!grid || !images.length) return;

    grid.classList.add('managed-service-gallery');
    grid.innerHTML = images.map(function(image, index) {
      const alt = image.alt || service.title || 'Service image';
      const caption = image.caption || `${service.title || 'Service'} view ${index + 1}`;
      return `<figure><button class="managed-gallery-link" type="button" data-gallery-index="${index}" aria-label="View details for ${escapeAttr(alt)}"><img src="${escapeAttr(image.src)}" alt="${escapeAttr(alt)}" loading="lazy"><figcaption><span>${escapeHtml(caption)}</span></figcaption></button></figure>`;
    }).join('');
    bindServiceGalleryDetails(service, images);
  }

  function bindServiceGalleryDetails(service, images) {
    document.querySelectorAll('.managed-gallery-link').forEach(function(button) {
      button.addEventListener('click', function() {
        const index = Number(button.getAttribute('data-gallery-index')) || 0;
        openServiceGalleryModal(service, images[index] || images[0], button);
      });
    });
  }

  function openServiceGalleryModal(service, image, trigger) {
    const modal = ensureServiceGalleryModal();
    const title = service.title || 'Service Details';
    const summary = service.summary || '';
    const description = service.description && service.description !== summary ? service.description : '';
    const imageAlt = image.alt || title;
    const imageCaption = image.caption || imageAlt;
    const featureItems = service.features && Array.isArray(service.features) && service.features.length
      ? service.features
      : currentFeatureItems();

    activeGalleryTrigger = trigger || null;

    const modalImage = modal.querySelector('.service-gallery-modal-image');
    modalImage.src = image.src;
    modalImage.alt = imageAlt;

    setScopedText(modal, '.service-gallery-kicker', service.category || 'Service Details');
    setScopedText(modal, '.service-gallery-modal-title', title);
    setScopedText(modal, '.service-gallery-summary', summary);
    setScopedText(modal, '.service-gallery-description', description);
    setScopedText(modal, '.service-gallery-caption', imageCaption === title ? '' : imageCaption);

    const points = modal.querySelector('.service-gallery-points');
    points.innerHTML = featureItems.slice(0, 6).map(function(item) {
      return `<li>${escapeHtml(item)}</li>`;
    }).join('');
    points.hidden = !featureItems.length;

    const cta = modal.querySelector('.service-gallery-cta');
    cta.href = contactHref();

    modal.hidden = false;
    document.body.classList.add('service-modal-open');
    modal.querySelector('.service-gallery-close').focus();
  }

  function ensureServiceGalleryModal() {
    let modal = document.getElementById('serviceGalleryModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'serviceGalleryModal';
    modal.className = 'service-gallery-modal';
    modal.hidden = true;
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'serviceGalleryModalTitle');
    modal.innerHTML = `
      <div class="service-gallery-backdrop" data-gallery-close></div>
      <div class="service-gallery-dialog">
        <button class="service-gallery-close" type="button" data-gallery-close aria-label="Close service details">&times;</button>
        <div class="service-gallery-media">
          <img class="service-gallery-modal-image" src="" alt="">
          <p class="service-gallery-caption"></p>
        </div>
        <div class="service-gallery-modal-copy">
          <p class="service-gallery-kicker"></p>
          <h3 class="service-gallery-modal-title" id="serviceGalleryModalTitle"></h3>
          <p class="service-gallery-summary"></p>
          <p class="service-gallery-description"></p>
          <ul class="service-gallery-points"></ul>
          <a class="btn btn-primary service-gallery-cta" href="../index.html#contact">Request Consultation</a>
        </div>
      </div>
    `;

    modal.addEventListener('click', function(event) {
      if (event.target.closest('[data-gallery-close]')) closeServiceGalleryModal();
    });

    document.addEventListener('keydown', function(event) {
      if (event.key === 'Escape') closeServiceGalleryModal();
    });

    document.body.appendChild(modal);
    return modal;
  }

  function closeServiceGalleryModal() {
    const modal = document.getElementById('serviceGalleryModal');
    if (!modal || modal.hidden) return;

    modal.hidden = true;
    document.body.classList.remove('service-modal-open');
    if (activeGalleryTrigger && typeof activeGalleryTrigger.focus === 'function') {
      activeGalleryTrigger.focus();
    }
    activeGalleryTrigger = null;
  }

  function currentFeatureItems() {
    return Array.prototype.slice.call(document.querySelectorAll('.feature-list li')).map(function(item) {
      return item.textContent.trim();
    }).filter(Boolean);
  }

  function contactHref() {
    const contact = document.querySelector('a[href$="#contact"]');
    return contact ? contact.getAttribute('href') : '../index.html#contact';
  }

  function setScopedText(root, selector, value) {
    const node = root.querySelector(selector);
    if (!node) return;
    node.textContent = value || '';
    node.hidden = !value;
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
      '.service-detail-grid{grid-template-columns:1fr!important;max-width:1120px;}',
      '.service-side-card{display:none!important;}',
      '.managed-service-gallery{grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:30px 0;}',
      '.managed-service-gallery figure{margin:0;}',
      '.managed-gallery-link{appearance:none;border:0;padding:0;width:100%;display:block;position:relative;overflow:hidden;border-radius:0;box-shadow:none;background:#071d33;min-height:390px;color:inherit;font:inherit;text-align:left;cursor:pointer;}',
      '.managed-gallery-link:focus-visible{outline:3px solid rgba(200,146,47,0.45);outline-offset:4px;}',
      '.managed-gallery-link::after{content:"";position:absolute;inset:45% 0 0;background:linear-gradient(0deg,rgba(7,29,51,0.78),rgba(7,29,51,0));pointer-events:none;}',
      '.managed-service-gallery img{display:block;height:390px;width:100%;object-fit:cover;box-shadow:none;transition:0.35s ease;}',
      '.managed-gallery-link:hover img{transform:scale(1.04);}',
      '.managed-service-gallery figcaption{position:absolute;left:22px;right:22px;bottom:20px;z-index:1;color:#fff;font-size:18px;line-height:1.3;font-weight:800;text-transform:uppercase;text-shadow:0 2px 18px rgba(0,0,0,0.35);pointer-events:none;}',
      '.managed-service-gallery figcaption span{display:block;}',
      '.service-modal-open{overflow:hidden;}',
      '.service-gallery-modal[hidden]{display:none;}',
      '.service-gallery-modal{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;padding:28px;}',
      '.service-gallery-backdrop{position:absolute;inset:0;background:rgba(4,18,31,0.72);backdrop-filter:blur(5px);}',
      '.service-gallery-dialog{position:relative;z-index:1;width:min(1120px,96vw);max-height:90vh;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(320px,0.75fr);background:#fff;overflow:auto;box-shadow:0 24px 80px rgba(0,0,0,0.35);}',
      '.service-gallery-close{position:absolute;top:16px;right:16px;z-index:2;width:44px;height:44px;border:0;border-radius:50%;background:#fff;color:#071d33;font-size:30px;line-height:1;box-shadow:0 12px 30px rgba(0,0,0,0.18);cursor:pointer;}',
      '.service-gallery-media{position:relative;height:min(78vh,620px);min-height:520px;background:#071d33;align-self:start;}',
      '.service-gallery-modal-image{display:block;width:100%;height:100%;object-fit:cover;}',
      '.service-gallery-caption{position:absolute;left:24px;right:24px;bottom:20px;margin:0;color:#fff;font-weight:800;text-transform:uppercase;text-shadow:0 2px 18px rgba(0,0,0,0.5);}',
      '.service-gallery-caption[hidden]{display:none;}',
      '.service-gallery-modal-copy{padding:44px 38px 38px;display:flex;flex-direction:column;gap:16px;}',
      '.service-gallery-kicker{margin:0;color:#c8922f;font-weight:800;text-transform:uppercase;letter-spacing:0;font-size:13px;}',
      '.service-gallery-modal-title{margin:0;color:#071d33;font-size:34px;line-height:1.08;}',
      '.service-gallery-summary,.service-gallery-description{margin:0;color:#5b6570;font-size:17px;line-height:1.65;}',
      '.service-gallery-points{list-style:none;margin:6px 0 6px;padding:0;display:grid;gap:10px;}',
      '.service-gallery-points[hidden]{display:none;}',
      '.service-gallery-points li{display:flex;gap:10px;align-items:flex-start;color:#071d33;font-weight:700;line-height:1.45;}',
      '.service-gallery-points li::before{content:"";width:9px;height:9px;border-radius:50%;background:#c8922f;flex:0 0 9px;margin-top:8px;}',
      '.service-gallery-cta{width:max-content;margin-top:auto;}',
      '@media (max-width: 980px){.managed-service-gallery{grid-template-columns:repeat(2,minmax(0,1fr));}.managed-gallery-link{min-height:330px;}.managed-service-gallery img{height:330px;}.service-gallery-dialog{grid-template-columns:1fr;width:min(760px,96vw);}.service-gallery-media{height:420px;min-height:380px;}.service-gallery-modal-copy{padding:34px 28px;}.service-gallery-modal-title{font-size:28px;}}',
      '@media (max-width: 640px){.managed-service-gallery{grid-template-columns:1fr;}.managed-gallery-link{min-height:300px;}.managed-service-gallery img{height:300px;}.managed-service-gallery figcaption{font-size:16px;}.service-gallery-modal{padding:14px;}.service-gallery-media{height:300px;min-height:300px;}.service-gallery-modal-copy{padding:28px 22px;}.service-gallery-close{top:10px;right:10px;}.service-gallery-cta{width:100%;justify-content:center;}.service-gallery-modal-title{font-size:25px;}}'
    ].join('');
    document.head.appendChild(style);
  }
})();
