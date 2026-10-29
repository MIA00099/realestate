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
    const team = Array.isArray(content && content.team) ? content.team : [];
    // Empty discovery collections still display public landing sections.
    ensureManagedStyles();
    updateHomeCards(services);
    renderPartners(content);
    renderTeam(content);
    renderDiscoveries(content);
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

  function renderTeam(content) {
    const section = document.getElementById('team');
    const grid = document.getElementById('teamGrid');
    const nav = document.querySelector('[data-team-nav]');
    if (!section || !grid) return;
    const members = (Array.isArray(content.team) ? content.team : [])
      .filter(m => m && m.name && m.role && m.description && m.image);
    section.hidden = false;
    if (nav) nav.hidden = false;
    if (!members.length) {
      grid.innerHTML = '<p class="team-empty">Our team profiles are being prepared. Please check back soon.</p>';
      return;
    }
    grid.innerHTML = members.map(function(member) {
      const long = member.description.length > 140;
      return '<article class="team-card">' +
        '<img src="' + escapeAttr(member.image) + '" alt="' + escapeAttr(member.name) + '" loading="lazy">' +
        '<div class="team-card-body"><h3>' + escapeHtml(member.name) + '</h3>' +
        '<p class="team-title">' + escapeHtml(member.role) + '</p>' +
        '<p class="team-description' + (long ? ' is-collapsed' : '') + '">' + escapeHtml(member.description) + '</p>' +
        (long ? '<button type="button" class="team-more" aria-expanded="false">READ MORE →</button>' : '') +
        '</div></article>';
    }).join('');
    grid.querySelectorAll('.team-more').forEach(button => {
      button.addEventListener('click', function() {
        const description = button.previousElementSibling;
        const expanded = button.getAttribute('aria-expanded') === 'true';
        description.classList.toggle('is-collapsed', expanded);
        button.setAttribute('aria-expanded', String(!expanded));
        button.textContent = expanded ? 'READ MORE →' : 'READ LESS ↑';
      });
    });
  }

  function renderDiscoveries(content) {
    const listings = Array.isArray(content.listings) ? content.listings : [];
    const events = Array.isArray(content.events) ? content.events : [];
    const listGrid = document.getElementById('listingsGrid');
    const eventGrid = document.getElementById('eventsGrid');
    const search = document.getElementById('listingSearch');
    const filter = document.getElementById('listingFilter');
    const count = document.getElementById('listingCount');
    if (listGrid) {
      const render = function() {
        const term = (search && search.value || '').toLowerCase().trim();
        const type = filter && filter.value || 'all';
        const visible = listings.filter(function(item) {
          return item && item.title && item.image &&
            (type === 'all' || String(item.type || 'other').toLowerCase() === type) &&
            (!term || (String(item.title) + ' ' + String(item.location || '')).toLowerCase().includes(term));
        });
        if (count) count.textContent = visible.length + ' properties found';
        listGrid.innerHTML = visible.map(function(item) {
          const price = Number(item.price);
          const priceText = Number.isFinite(price) && price > 0 ? 'RWF ' + new Intl.NumberFormat('en-RW').format(price) : 'Contact for price';
          return '<article class="menu-property-card"><img loading="lazy" src="' + escapeAttr(item.image) + '" alt="' + escapeAttr(item.title) + '">' +
            '<div class="menu-property-info"><p class="menu-property-price">' + priceText + '</p><h3>' + escapeHtml(item.title) + '</h3>' +
            '<p>' + escapeHtml(item.location || 'Rwanda') + '</p><p>' + escapeHtml(item.type || 'Property') + '</p>' +
            '<a class="btn btn-primary" href="#contact">Request Details</a></div></article>';
        }).join('') || '<p class="menu-empty">No matching properties are published yet. Contact us to discuss available opportunities.</p>';
      };
      if (search) search.addEventListener('input', render);
      if (filter) filter.addEventListener('change', render);
      render();
    }
    if (eventGrid) eventGrid.innerHTML = events.filter(e => e && e.title).map(function(item) {
      return '<article class="menu-property-card"><div class="menu-property-info"><h3>' + escapeHtml(item.title) + '</h3>' +
        '<p>' + escapeHtml(item.date || 'Date to be announced') + '</p><p>' + escapeHtml(item.description || '') + '</p>' +
        '<a class="btn btn-primary" href="#contact">Ask About Event</a></div></article>';
    }).join('') || '<p class="menu-empty">Upcoming events will be announced here. Contact us to learn about the next webinar.</p>';
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
    const cards = partners.map(function(partner) {
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

    // Identical groups form a seamless loop. The second group is decorative,
    // preventing assistive technology from announcing partners twice.
    grid.classList.add('partner-marquee');
    grid.setAttribute('aria-label', 'Our trusted partners');
    grid.innerHTML = '<div class="partner-marquee-track">' +
      '<div class="partner-marquee-group">' + cards + '</div>' +
      '<div class="partner-marquee-group" aria-hidden="true" inert>' + cards + '</div>' +
      '</div>';
    grid.style.setProperty('--marquee-duration', Math.max(22, partners.length * 5) + 's');
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

/* Shared service inquiry widget. Email opens a draft; WhatsApp opens a prefilled chat.
   Neither action claims delivery until the visitor sends the message. */
(function () {
  'use strict';
  
  const servicePage = /^\/services\/[^/]+\.html$/i.test(location.pathname);
  const pageTitle = document.title.split('|')[0].trim();
  const serviceName = servicePage ? pageTitle : '';

  function initialize() {
    if (document.getElementById('menu-service-request')) return;
    const style = document.createElement('style');
    style.textContent = [
      '.msr-trigger{position:fixed;right:20px;bottom:20px;z-index:1050;background:#071d33;color:white;border:2px solid #c8922f;border-radius:999px;padding:13px 20px;font:700 15px system-ui,sans-serif;box-shadow:0 12px 28px #071d3355;cursor:pointer}',
      '.msr-trigger[hidden]{display:none!important}',
      '.msr-trigger:focus-visible,.msr-dialog button:focus-visible,.msr-dialog input:focus-visible,.msr-dialog textarea:focus-visible{outline:3px solid #c8922f;outline-offset:3px}',
      '.msr-overlay[hidden]{display:none!important}.msr-overlay{position:fixed;inset:0;z-index:2000;background:#071d33b8;display:grid;place-items:center;padding:16px;overflow:auto}',
      '.msr-dialog{position:relative;width:min(510px,100%);max-height:calc(100dvh - 32px);overflow-y:auto;background:white;color:#071d33;border-radius:18px;padding:28px;box-shadow:0 20px 70px #0004;font:16px system-ui,sans-serif}',
      '.msr-dialog h2{font-size:25px;margin:0 35px 8px 0}.msr-dialog p{color:#536274;margin:0 0 18px}.msr-dialog label{display:block;font-weight:650;margin:12px 0 5px}',
      '.msr-dialog input,.msr-dialog textarea{display:block;width:100%;box-sizing:border-box;border:1px solid #b7c0cb;border-radius:9px;padding:11px;font:inherit;background:white;color:#071d33}',
      '.msr-dialog textarea{min-height:95px;resize:vertical}.msr-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}',
      '.msr-actions button{flex:1 1 175px;border:0;border-radius:10px;padding:13px 12px;cursor:pointer;font:700 15px system-ui,sans-serif}',
      '.msr-email{background:#071d33;color:white}.msr-whatsapp{background:#137e54;color:white}',
      '.msr-close{position:absolute;right:16px;top:12px;border:0;background:transparent;color:#071d33;font-size:29px;cursor:pointer}',
      '.msr-status{font-size:13px!important;margin:14px 0 0!important;color:#536274!important}',
      '@media(max-width:480px){.msr-trigger{right:12px;bottom:12px;padding:12px 15px}.msr-dialog{padding:22px}}'
    ].join('');
    document.head.appendChild(style);

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'msr-trigger';
    trigger.textContent = 'Request a Service';
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-controls', 'menu-service-request');
    // Keep the floating request button from covering footer social links.
    // The full contact section remains available when the footer is visible.
    const pageFooter = document.querySelector('footer');
    if (pageFooter && typeof IntersectionObserver !== 'undefined') {
      const footerObserver = new IntersectionObserver(entries => {
        trigger.hidden = entries.some(entry => entry.isIntersecting);
      }, { threshold: 0 });
      footerObserver.observe(pageFooter);
    }

    const overlay = document.createElement('div');
    overlay.id = 'menu-service-request';
    overlay.className = 'msr-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <section class="msr-dialog" role="dialog" aria-modal="true" aria-labelledby="msr-title">
        <button type="button" class="msr-close" aria-label="Close request form">&times;</button>
        <h2 id="msr-title">Request a Service</h2>
        <p>Tell MENU Real Estate Group how we can help you.</p>
        <form id="msr-form">
          <label for="msr-name">Full name *</label><input id="msr-name" name="name" required maxlength="100" autocomplete="name">
          <label for="msr-phone">Phone number *</label><input id="msr-phone" name="phone" type="tel" required maxlength="30" autocomplete="tel">
          <label for="msr-email">Email address *</label><input id="msr-email" name="email" type="email" required maxlength="160" autocomplete="email">
          <label for="msr-service">Service required *</label><input id="msr-service" name="service" required maxlength="160">
          <label for="msr-message">How can we help? *</label><textarea id="msr-message" name="message" required maxlength="2500"></textarea>
          <div class="msr-actions">
            <button type="submit" class="msr-email">Send Request</button>
          </div>
          <p class="msr-status" role="status">Your message will be sent directly from this website.</p>
        </form>
      </section>`;
    document.body.append(trigger, overlay);
    const form = overlay.querySelector('#msr-form');
    const close = () => { overlay.hidden = true; document.body.style.overflow = ''; trigger.focus(); };
    trigger.addEventListener('click', () => {
      form.elements.service.value = serviceName;
      overlay.hidden = false;
      document.body.style.overflow = 'hidden';
      form.elements.name.focus();
    });
    overlay.querySelector('.msr-close').addEventListener('click', close);
    overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
    document.addEventListener('keydown', event => {
      if (overlay.hidden) return;
      if (event.key === 'Escape') close();
      if (event.key === 'Tab') {
        const controls = Array.from(overlay.querySelectorAll('button,input,textarea'));
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const button = form.querySelector('[type="submit"]');
      const status = form.querySelector('.msr-status');
      const payload = Object.fromEntries(new FormData(form));
      button.disabled = true;
      button.textContent = 'Sending...';
      status.textContent = 'Sending your request securely...';
      try {
        const response = await fetch('/api/service-requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send request.');
        status.textContent = result.confirmationSent
          ? 'Your request has been sent successfully. A confirmation email is on its way.'
          : 'Your request has been sent successfully. We could not send the confirmation email.';
        form.reset();
      } catch (error) {
        status.textContent = error.message || 'Could not send your request. Please try again.';
      } finally {
        button.disabled = false;
        button.textContent = 'Send Request';
      }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
