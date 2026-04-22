// js/offer-letter.js

(function () {
  // Shared signature renderer — also used by the completion-certificate
  // generator via window.drawInternSphereSignature.
  const SIG_FONT = 'italic 800 56px "Brush Script MT", "Snell Roundhand", "Apple Chancery", "Lucida Handwriting", cursive';

  function drawSignatureBlock(ctx, x, y, scriptName, fullName, title) {
    // Script signature sits 24px ABOVE y so its descenders + flourish never
    // crowd the rule line or the printed name underneath.
    const scriptBaseline = y - 24;

    ctx.save();
    ctx.fillStyle = "#1e1b4b";
    ctx.font = SIG_FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.strokeStyle = "rgba(30, 27, 75, 0.3)";
    ctx.lineWidth = 0.6;
    ctx.fillText(scriptName, x + 20, scriptBaseline);
    // flourish underline — kept below script, above rule line
    ctx.strokeStyle = "rgba(30, 27, 75, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + 10, scriptBaseline + 12);
    ctx.bezierCurveTo(
      x + 120, scriptBaseline + 26,
      x + 220, scriptBaseline - 4,
      x + 320, scriptBaseline + 14
    );
    ctx.stroke();
    ctx.restore();

    // Rule line — well clear of the script's lowest stroke
    ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 30);
    ctx.lineTo(x + 360, y + 30);
    ctx.stroke();

    // Printed name + title — comfortable spacing from rule
    ctx.fillStyle = "#0f172a";
    ctx.font = '700 20px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = "left";
    ctx.fillText(fullName, x, y + 60);
    ctx.fillStyle = "rgba(15, 23, 42, 0.6)";
    ctx.font = '500 15px "Inter", "Helvetica Neue", Arial, sans-serif';
    ctx.fillText(title + " · InternSphere", x, y + 84);
  }

  window.drawInternSphereSignature = drawSignatureBlock;

  // Cosmic hero painter — deep-space gradient + scattered starfield + drifting
  // crescent. Shared between the offer letter and the completion certificate
  // so both documents share a single visual identity.
  // bgColor is the page background color used to draw the diagonal cut.
  function drawCosmicHero(ctx, W, heroH, bgColor) {
    bgColor = bgColor || "#fbfaf6";

    // Realistic deep-space gradient — modeled on Hubble/JWST imagery:
    // mostly near-black with a navy core, warmed slightly toward the
    // bottom-right where a distant nebula glows. No fantasy purples.
    const grad = ctx.createLinearGradient(0, 0, W, heroH);
    grad.addColorStop(0,    "#000308");   // near-black void
    grad.addColorStop(0.35, "#02071c");   // deep space blue-black
    grad.addColorStop(0.70, "#06122c");   // distant navy
    grad.addColorStop(1,    "#13294b");   // faintly lit horizon
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, heroH);

    // Cold blue interstellar dust on the left — mimics scattered starlight
    const dust1 = ctx.createRadialGradient(W * 0.22, heroH * 0.58, 0, W * 0.22, heroH * 0.58, 520);
    dust1.addColorStop(0, "rgba(80, 130, 200, 0.22)");
    dust1.addColorStop(1, "rgba(80, 130, 200, 0)");
    ctx.fillStyle = dust1;
    ctx.fillRect(0, 0, W, heroH);

    // Warm rust/amber nebula glow on the right — color of ionized hydrogen
    // visible in actual deep-space photos (e.g. Pillars of Creation)
    const neb = ctx.createRadialGradient(W * 0.78, heroH * 0.40, 0, W * 0.78, heroH * 0.40, 480);
    neb.addColorStop(0,   "rgba(196, 90, 50, 0.28)");
    neb.addColorStop(0.5, "rgba(140, 60, 40, 0.14)");
    neb.addColorStop(1,   "rgba(196, 90, 50, 0)");
    ctx.fillStyle = neb;
    ctx.fillRect(0, 0, W, heroH);

    // Starfield — naturalistic. Most stars are cool white, a minority
    // tinted slightly blue (hot O/B-type) or warm amber (red giants).
    // Deterministic seed so every render is identical.
    const rnd = (function () {
      let s = 0xC0FFEE;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    })();
    function starColor(t, alpha) {
      // 70% white, 20% cool blue-white, 10% warm amber
      let r, g, b;
      if (t < 0.7)      { r = 255; g = 255; b = 248; }
      else if (t < 0.9) { r = 200; g = 220; b = 255; }
      else              { r = 255; g = 215; b = 175; }
      return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
    }
    for (let i = 0; i < 180; i++) {
      const x = rnd() * W;
      const y = rnd() * (heroH - 60);
      const r = rnd() * 1.1 + 0.3;
      ctx.fillStyle = starColor(rnd(), (0.35 + rnd() * 0.55).toFixed(2));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // A few bright stars with a tight diffraction-like halo
    for (let i = 0; i < 8; i++) {
      const x = rnd() * W;
      const y = rnd() * (heroH - 80);
      const tint = rnd();
      const haloColor = tint < 0.6 ? "255, 255, 245" :
                        tint < 0.85 ? "190, 215, 255" : "255, 210, 170";
      const halo = ctx.createRadialGradient(x, y, 0, x, y, 14);
      halo.addColorStop(0, "rgba(" + haloColor + ", 0.55)");
      halo.addColorStop(1, "rgba(" + haloColor + ", 0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant moon — gibbous, warm-grey body with cooler limb glow.
    // Looks like a real telescope shot, not a fantasy crescent.
    const moonX = W - 180;
    const moonY = 110;
    const moonR = 52;
    // soft outer glow first (atmospheric scatter)
    const moonHalo = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, moonR + 70);
    moonHalo.addColorStop(0, "rgba(220, 230, 245, 0.10)");
    moonHalo.addColorStop(1, "rgba(220, 230, 245, 0)");
    ctx.fillStyle = moonHalo;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR + 70, 0, Math.PI * 2);
    ctx.fill();
    // moon body — warm-grey with subtle radial shading (sun-lit side bright)
    const moonBody = ctx.createRadialGradient(moonX - moonR * 0.35, moonY - moonR * 0.35, 2, moonX, moonY, moonR);
    moonBody.addColorStop(0,    "#f4eddc");
    moonBody.addColorStop(0.6,  "#cabfa6");
    moonBody.addColorStop(1,    "#5b5141");
    ctx.fillStyle = moonBody;
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    // a couple of subtle "craters"
    ctx.fillStyle = "rgba(60, 50, 40, 0.18)";
    ctx.beginPath(); ctx.arc(moonX + 8,  moonY - 10, 7,  0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX - 14, moonY + 12, 5,  0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + 18, moonY + 16, 4,  0, Math.PI * 2); ctx.fill();

    // Diagonal bottom cut — keeps the original "boarding pass" feel
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.moveTo(0, heroH);
    ctx.lineTo(W, heroH - 60);
    ctx.lineTo(W, heroH + 40);
    ctx.lineTo(0, heroH + 40);
    ctx.closePath();
    ctx.fill();
  }
  window.drawInternSphereCosmicHero = drawCosmicHero;

  window.downloadOfferLetter = function downloadOfferLetter(opts) {
    const cfg = opts || {};
    const studentName = String(cfg.studentName || "Intern").trim();
    const company     = String(cfg.company     || "InternSphere").trim();
    const role        = String(cfg.role        || "Internship").trim();
    const startDate   = String(cfg.startDate   || new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    })).trim();
    const duration    = String(cfg.duration    || "").trim();
    const location    = String(cfg.location    || "").trim();
    const stipend     = String(cfg.stipend     || "").trim();

    const W = 1600, H = 2050;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Cream background — softer than pure white, easier on the eye.
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    // Subtle dot grid across the body — visual texture without noise.
    ctx.fillStyle = "rgba(124, 107, 255, 0.06)";
    for (let yy = 600; yy < H - 100; yy += 28) {
      for (let xx = 80; xx < W - 80; xx += 28) {
        ctx.beginPath();
        ctx.arc(xx, yy, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // text helpers

    function textCenter(text, y, opts = {}) {
      const { size = 28, weight = "400", color = "#0f172a", tracking = 0 } = opts;
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      if (tracking) {
        const chars = String(text).split("");
        const widths = chars.map((c) => ctx.measureText(c).width);
        const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
        let x = W / 2 - total / 2;
        ctx.textAlign = "left";
        chars.forEach((c, i) => { ctx.fillText(c, x, y); x += widths[i] + tracking; });
        ctx.textAlign = "center";
      } else {
        ctx.fillText(text, W / 2, y);
      }
    }

    function textLeft(text, x, y, opts = {}) {
      const { size = 24, weight = "400", color = "#0f172a" } = opts;
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(text, x, y);
    }

    // Rounded-rect path (canvas doesn't ship one until very recent versions).
    function roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y,     x + w, y + h, rr);
      c.arcTo(x + w, y + h, x,     y + h, rr);
      c.arcTo(x,     y + h, x,     y,     rr);
      c.arcTo(x,     y,     x + w, y,     rr);
      c.closePath();
    }

    // Section heading — purple title + accent rule beneath. Used by every
    // formal section in the letter so they read like a real document.
    function drawSectionHead(ctx, label, x, y) {
      ctx.fillStyle = "#6d28d9";
      ctx.font = '800 20px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(label, x, y);
      const w = ctx.measureText(label).width;
      ctx.strokeStyle = "rgba(124, 107, 255, 0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y + 12);
      ctx.lineTo(x + w + 80, y + 12);
      ctx.stroke();
    }

    function wrapText(text, x, y, maxWidth, opts = {}) {
      const { size = 24, weight = "400", color = "#0f172a", lineHeight = 1.55 } = opts;
      ctx.fillStyle = color;
      ctx.font = `${weight} ${size}px "Inter", "Helvetica Neue", Arial, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      const words = String(text).split(/\s+/);
      let line = "";
      let cursorY = y;
      for (let i = 0; i < words.length; i++) {
        const test = line ? line + " " + words[i] : words[i];
        const width = ctx.measureText(test).width;
        if (width > maxWidth && line) {
          ctx.fillText(line, x, cursorY);
          line = words[i];
          cursorY += size * lineHeight;
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, x, cursorY);
      return cursorY;
    }

    // render

    function paint(logoImg) {
      // ═══ COSMIC HERO BANNER ═══
      const heroH = 460;
      drawCosmicHero(ctx, W, heroH, "#fbfaf6");

      // Logo top-left
      if (logoImg) {
        const maxH = 96;
        const ratio = logoImg.width / logoImg.height;
        const h = maxH;
        const w = h * ratio;
        ctx.drawImage(logoImg, 100, 70, w, h);
      }

      // Eyebrow + reference (top-right)
      const refCode = "REF-" + (Date.now().toString(36).toUpperCase().slice(-6));
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = '700 13px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("OFFER · " + refCode, W - 100, 100);
      ctx.fillText(startDate.toUpperCase(), W - 100, 124);
      ctx.textAlign = "left";

      // Big salutation
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.font = '600 22px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.fillText("Welcome aboard,", 100, 230);

      // Headline name — the hero of the document
      ctx.fillStyle = "#ffffff";
      ctx.font = '900 78px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(studentName, 100, 310);

      // Sub-headline: role · company
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = '700 26px "Inter", "Helvetica Neue", Arial, sans-serif';
      const subHead = company && company !== "InternSphere"
        ? `${role}  ·  ${company}`
        : role;
      ctx.fillText(subHead, 100, 360);

      // ═══ STAT CARD ROW (overlapping banner edge) ═══
      // Four mini-cards with key terms — visual focal point.
      const stats = [
        { label: "DURATION",   value: duration || "—" },
        { label: "LOCATION",   value: location || "—" },
        { label: "STIPEND",    value: stipend  || "—" },
        { label: "START DATE", value: startDate },
      ];
      const cardY = heroH - 30;
      const cardH = 130;
      const totalW = W - 200;
      const gap = 16;
      const cardW = (totalW - gap * (stats.length - 1)) / stats.length;
      stats.forEach((s, i) => {
        const x = 100 + i * (cardW + gap);
        // shadow
        ctx.fillStyle = "rgba(15, 23, 42, 0.10)";
        roundRect(ctx, x + 2, cardY + 6, cardW, cardH, 14);
        ctx.fill();
        // card
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, x, cardY, cardW, cardH, 14);
        ctx.fill();
        // accent stripe (top, gradient-flavored)
        ctx.fillStyle = i % 2 === 0 ? "#7c3aed" : "#db2777";
        roundRect(ctx, x, cardY, cardW, 4, 14);
        ctx.fill();
        // label
        ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
        ctx.font = '700 12px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(s.label, x + 22, cardY + 42);
        // value (truncate if too long)
        ctx.fillStyle = "#0f172a";
        ctx.font = '800 24px "Inter", sans-serif';
        const val = String(s.value);
        const maxValW = cardW - 44;
        let displayVal = val;
        if (ctx.measureText(displayVal).width > maxValW) {
          while (ctx.measureText(displayVal + "…").width > maxValW && displayVal.length > 0) {
            displayVal = displayVal.slice(0, -1);
          }
          displayVal += "…";
        }
        ctx.fillText(displayVal, x + 22, cardY + 88);
      });

      // ═══ BODY — short, confident sections with vertical accent bars ═══
      let y = cardY + cardH + 90;
      const bodyX = 100;
      const bodyMaxW = W - 200;

      const sections = [
        {
          title: "The offer",
          body: company && company !== "InternSphere"
            ? `We're pleased to offer you the role of ${role} at ${company}. ` +
              `Your profile stood out, and we'd be glad to have you on the team.`
            : `We're pleased to offer you the role of ${role}. ` +
              `Your profile stood out, and we'd be glad to have you on the team.`,
        },
        {
          title: "What you'll do",
          body:
            "Your tasks, feedback, and progress live in the Virtual Workroom. " +
            "Show up consistently, hit your deadlines, and treat the work like you would on-site.",
        },
        {
          title: "Confidentiality",
          body:
            "Anything non-public you encounter — company processes, candidate data, internal materials — " +
            "stays confidential and is used only for this internship.",
        },
        {
          title: "Getting started",
          body:
            "Your tasks and mentor feedback will be ready for you on the start date listed above. " +
            "Reach us at InternSphere7@gmail.com for any questions. Welcome aboard.",
        },
      ];

      sections.forEach((s) => {
        // accent bar to the left
        const barTop = y - 24;
        const barBottom = y + 12 + 19 * 1.55 * 4;
        const barHeight = Math.max(60, barBottom - barTop);
        const barGrad = ctx.createLinearGradient(0, barTop, 0, barTop + barHeight);
        barGrad.addColorStop(0, "#7c3aed");
        barGrad.addColorStop(1, "#db2777");
        ctx.fillStyle = barGrad;
        roundRect(ctx, bodyX - 28, barTop, 4, barHeight, 2);
        ctx.fill();

        // title
        ctx.fillStyle = "#0f172a";
        ctx.font = '900 22px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(s.title, bodyX, y);

        // body — wrapped
        const bodyEndY = wrapText(s.body, bodyX, y + 36, bodyMaxW, {
          size: 19,
          color: "rgba(15, 23, 42, 0.82)",
          lineHeight: 1.55,
        });
        y = bodyEndY + 50;
      });

      // ═══ SIGNATURES ═══
      const sigRowY = Math.max(y + 120, H - 320);

      // Soft divider, broken in the middle by the SIGNED BY label so the
      // label visually separates the two signature blocks.
      const cx2 = W / 2;
      const labelY = sigRowY - 80;
      ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
      ctx.font = '800 13px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("· SIGNED BY ·", cx2, labelY);
      ctx.textAlign = "left";

      // Two short rule segments either side of the centered label
      ctx.strokeStyle = "rgba(124, 107, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(140, labelY - 5);
      ctx.lineTo(cx2 - 90, labelY - 5);
      ctx.moveTo(cx2 + 90, labelY - 5);
      ctx.lineTo(W - 140, labelY - 5);
      ctx.stroke();

      drawSignatureBlock(ctx, 100,            sigRowY, "Sahil", "Sahil Bind",    "Founder");
      drawSignatureBlock(ctx, W - 100 - 420,  sigRowY, "Akash", "Akash Nalbotla", "Co-founder");

      // ═══ FOOTER ═══
      ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
      ctx.font = '500 14px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        "Issued digitally  ·  InternSphere7@gmail.com  ·  " + refCode,
        W / 2,
        H - 60
      );
      ctx.textAlign = "left";

      // download
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = studentName.replace(/[^a-z0-9]+/gi, "_") || "intern";
        a.href = url;
        a.download = `InternSphere_OfferLetter_${safeName}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, "image/png");
    }

    const logo = new Image();
    logo.onload  = () => paint(logo);
    logo.onerror = () => paint(null);
    logo.src = "assets/images/Internsphere logo.png";
  };
})();
