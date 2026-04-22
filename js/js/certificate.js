// js/certificate.js
// Client-side PNG generator for the Completion Certificate. Mirrors the
// offer-letter style. Exposed as window.downloadCompletionCertificate(opts).
// Requires window.drawInternSphereSignature (from offer-letter.js) to be
// loaded before this runs; signatures are skipped gracefully otherwise.

(function () {
  window.downloadCompletionCertificate = function downloadCompletionCertificate(opts) {
    const cfg = opts || {};
    const studentName       = String(cfg.studentName       || "Intern").trim();
    const internshipTitle   = String(cfg.internshipTitle   || "Virtual Internship").trim();
    const internshipCompany = String(cfg.internshipCompany || "").trim();
    const btn               = cfg.buttonEl || null;

    const origLabel = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Preparing…"; }

    // Landscape format keeps the certificate frame-able. Slightly taller
    // than before to accommodate the new banner + signature spacing.
    const W = 1600, H = 1280;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Cream background — matches the offer letter for a consistent visual identity.
    ctx.fillStyle = "#fbfaf6";
    ctx.fillRect(0, 0, W, H);

    // Subtle dot grid texture across the body
    ctx.fillStyle = "rgba(124, 107, 255, 0.06)";
    for (let yy = 540; yy < H - 100; yy += 28) {
      for (let xx = 80; xx < W - 80; xx += 28) {
        ctx.beginPath();
        ctx.arc(xx, yy, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cx = W / 2;
    const refCode = "CERT-" + (Date.now().toString(36).toUpperCase().slice(-6));
    const dateStr = new Date().toLocaleDateString(undefined, {
      year: "numeric", month: "long", day: "numeric",
    });

    // Rounded rectangle path helper (same as offer-letter)
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

    function paint(logoImg) {
      // ═══ COSMIC HERO BANNER ═══
      const heroH = 420;
      if (typeof window.drawInternSphereCosmicHero === "function") {
        window.drawInternSphereCosmicHero(ctx, W, heroH, "#fbfaf6");
      } else {
        // graceful fallback if offer-letter.js hasn't loaded yet
        const grad = ctx.createLinearGradient(0, 0, W, heroH);
        grad.addColorStop(0,    "#4c1d95");
        grad.addColorStop(0.55, "#7c3aed");
        grad.addColorStop(1,    "#db2777");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, heroH);
        ctx.fillStyle = "#fbfaf6";
        ctx.beginPath();
        ctx.moveTo(0, heroH); ctx.lineTo(W, heroH - 50);
        ctx.lineTo(W, heroH + 36); ctx.lineTo(0, heroH + 36);
        ctx.closePath();
        ctx.fill();
      }

      // Logo top-left
      if (logoImg) {
        const maxH = 96;
        const ratio = logoImg.width / logoImg.height;
        const h = maxH;
        const w = h * ratio;
        ctx.drawImage(logoImg, 100, 70, w, h);
      }

      // Reference + date top-right
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = '700 13px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("CERTIFICATE · " + refCode, W - 100, 100);
      ctx.fillText(dateStr.toUpperCase(), W - 100, 124);
      ctx.textAlign = "left";

      // Eyebrow + headline
      ctx.fillStyle = "rgba(255, 255, 255, 0.78)";
      ctx.font = '600 22px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.fillText("Certificate of Completion", 100, 220);

      ctx.fillStyle = "#ffffff";
      ctx.font = '900 78px "Inter", "Helvetica Neue", Arial, sans-serif';
      ctx.fillText(studentName, 100, 300);

      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      ctx.font = '700 24px "Inter", "Helvetica Neue", Arial, sans-serif';
      const sub = internshipCompany
        ? `${internshipTitle}  ·  ${internshipCompany}`
        : internshipTitle;
      ctx.fillText(sub, 100, 348);

      // ═══ STAT CARD ROW (overlapping banner) ═══
      const stats = [
        { label: "INTERNSHIP", value: internshipTitle },
        { label: "COMPANY",    value: internshipCompany || "—" },
        { label: "ISSUED ON",  value: dateStr },
      ];
      const cardY = heroH - 28;
      const cardH = 120;
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
        // top accent stripe
        ctx.fillStyle = i % 2 === 0 ? "#7c3aed" : "#db2777";
        roundRect(ctx, x, cardY, cardW, 4, 14);
        ctx.fill();
        // label
        ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
        ctx.font = '700 12px "Inter", sans-serif';
        ctx.textAlign = "left";
        ctx.fillText(s.label, x + 22, cardY + 40);
        // value (truncate if needed)
        ctx.fillStyle = "#0f172a";
        ctx.font = '800 22px "Inter", sans-serif';
        let v = String(s.value);
        const maxValW = cardW - 44;
        if (ctx.measureText(v).width > maxValW) {
          while (ctx.measureText(v + "…").width > maxValW && v.length > 0) {
            v = v.slice(0, -1);
          }
          v += "…";
        }
        ctx.fillText(v, x + 22, cardY + 80);
      });

      // ═══ BODY — single confident statement with vertical accent bar ═══
      const bodyY = cardY + cardH + 70;
      const bodyX = 100;
      const bodyMaxW = W - 200;

      // Accent bar (gradient)
      const barH = 96;
      const barGrad = ctx.createLinearGradient(0, bodyY - 24, 0, bodyY - 24 + barH);
      barGrad.addColorStop(0, "#7c3aed");
      barGrad.addColorStop(1, "#db2777");
      ctx.fillStyle = barGrad;
      roundRect(ctx, bodyX - 28, bodyY - 24, 4, barH, 2);
      ctx.fill();

      ctx.fillStyle = "#0f172a";
      ctx.font = '900 22px "Inter", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText("Recognition of completion", bodyX, bodyY);

      ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
      ctx.font = '500 19px "Inter", sans-serif';
      const line1 = "Awarded for finishing every assigned task and review cycle for this internship.";
      const line2 = "Built, submitted, and shipped through the InternSphere Virtual Workroom.";
      ctx.fillText(line1, bodyX, bodyY + 36);
      ctx.fillText(line2, bodyX, bodyY + 64);

      // ═══ SIGNATURES ═══
      const sigRowY = H - 200;

      // Centered SIGNED BY label between the two signature blocks, with
      // short rule segments on either side. Sits well above the script
      // signature so it never overlaps.
      const cx2 = W / 2;
      const labelY = sigRowY - 80;
      ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
      ctx.font = '800 13px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("· SIGNED BY ·", cx2, labelY);
      ctx.textAlign = "left";

      ctx.strokeStyle = "rgba(124, 107, 255, 0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(140, labelY - 5);
      ctx.lineTo(cx2 - 90, labelY - 5);
      ctx.moveTo(cx2 + 90, labelY - 5);
      ctx.lineTo(W - 140, labelY - 5);
      ctx.stroke();

      if (typeof window.drawInternSphereSignature === "function") {
        window.drawInternSphereSignature(ctx, 100,           sigRowY, "Sahil", "Sahil Bind",    "Founder");
        window.drawInternSphereSignature(ctx, W - 100 - 420, sigRowY, "Akash", "Akash Nalbotla", "Co-founder");
      }

      // ═══ FOOTER ═══
      ctx.fillStyle = "rgba(15, 23, 42, 0.5)";
      ctx.font = '500 13px "Inter", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        "Issued on " + dateStr + "  ·  InternSphere7@gmail.com  ·  " + refCode,
        cx,
        H - 50
      );
      ctx.textAlign = "left";

      canvas.toBlob((blob) => {
        if (!blob) { resetBtn(); return; }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        const safeName = studentName.replace(/[^a-z0-9]+/gi, "_") || "intern";
        a.href = url;
        a.download = "InternSphere_Certificate_" + safeName + ".png";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        resetBtn();
      }, "image/png");
    }

    function resetBtn() {
      if (!btn) return;
      btn.disabled = false;
      btn.textContent = origLabel || "⬇ Download Certificate";
    }

    const logo = new Image();
    logo.onload  = () => paint(logo);
    logo.onerror = () => paint(null);
    logo.src = "assets/images/Internsphere logo.png";
  };
})();
