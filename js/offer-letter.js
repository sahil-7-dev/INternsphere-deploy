// js/offer-letter.js

(function () {
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

    const W = 1600, H = 2000;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d");

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    const g1 = ctx.createRadialGradient(0, 0, 0, 0, 0, 800);
    g1.addColorStop(0, "rgba(124, 107, 255, 0.12)");
    g1.addColorStop(1, "rgba(124, 107, 255, 0)");
    ctx.fillStyle = g1;
    ctx.fillRect(0, 0, W, H);
    const g2 = ctx.createRadialGradient(W, H, 0, W, H, 800);
    g2.addColorStop(0, "rgba(236, 72, 153, 0.10)");
    g2.addColorStop(1, "rgba(236, 72, 153, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = "rgba(124, 107, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(50, 50, W - 100, H - 100);
    ctx.strokeStyle = "rgba(15, 23, 42, 0.10)";
    ctx.lineWidth = 1;
    ctx.strokeRect(72, 72, W - 144, H - 144);

    const scan = ctx.createLinearGradient(0, 0, W, 0);
    scan.addColorStop(0,    "rgba(124, 107, 255, 0)");
    scan.addColorStop(0.35, "rgba(124, 107, 255, 0.85)");
    scan.addColorStop(0.65, "rgba(236, 72, 153, 0.85)");
    scan.addColorStop(1,    "rgba(236, 72, 153, 0)");
    ctx.fillStyle = scan;
    ctx.fillRect(50, 50, W - 100, 2);

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
      if (logoImg) {
        const maxH = 110;
        const ratio = logoImg.width / logoImg.height;
        const h = maxH;
        const w = h * ratio;
        ctx.drawImage(logoImg, W / 2 - w / 2, 130, w, h);
      }

      textCenter("LETTER OF INTERNSHIP OFFER", 310, {
        size: 18, weight: "800", color: "#6d28d9", tracking: 6,
      });

      textLeft("Issued: " + startDate, 140, 400, {
        size: 18, color: "rgba(15, 23, 42, 0.55)",
      });

      textLeft(`Dear ${studentName},`, 140, 480, {
        size: 28, weight: "700", color: "#0f172a",
      });

      const opening = company && company !== "InternSphere"
        ? `We are pleased to offer you the position of ${role} at ${company}. ` +
          `This offer is extended based on the successful review of your application ` +
          `through the InternSphere Virtual Internship Portal.`
        : `We are pleased to offer you the position of ${role}. ` +
          `This offer is extended based on the successful review of your application ` +
          `through the InternSphere Virtual Internship Portal.`;
      let y = wrapText(opening, 140, 560, W - 280, {
        size: 24, color: "rgba(15, 23, 42, 0.86)", lineHeight: 1.55,
      });

      y += 80;
      textLeft("Internship details", 140, y, {
        size: 20, weight: "800", color: "#6d28d9",
      });
      y += 20;
      ctx.strokeStyle = "rgba(124, 107, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, y);
      ctx.lineTo(320, y);
      ctx.stroke();
      y += 40;

      const fields = [
        ["Position",  role],
        ["Company",   company],
        ["Duration",  duration || "—"],
        ["Location",  location || "—"],
        ["Stipend",   stipend  || "—"],
        ["Start date", startDate],
      ];
      const rowH = 46;
      fields.forEach(([k, v]) => {
        textLeft(k, 140, y, { size: 20, weight: "600", color: "rgba(15, 23, 42, 0.58)" });
        textLeft(v, 420, y, { size: 22, weight: "700", color: "#0f172a" });
        y += rowH;
      });

      y += 40;
      const closing =
        "Please log in to the InternSphere dashboard to begin your internship in the Virtual Workroom. " +
        "Your assigned tasks, progress tracking, and mentor feedback will be accessible from day one. " +
        "We look forward to working with you.";
      y = wrapText(closing, 140, y, W - 280, {
        size: 22, color: "rgba(15, 23, 42, 0.78)", lineHeight: 1.55,
      });

      const sigY = Math.max(y + 120, H - 260);
      ctx.strokeStyle = "rgba(15, 23, 42, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(140, sigY);
      ctx.lineTo(520, sigY);
      ctx.stroke();
      textLeft("InternSphere — Virtual Internship Portal", 140, sigY + 34, {
        size: 20, weight: "700", color: "#0f172a",
      });
      textLeft("Issued digitally · interns@internsphere.example", 140, sigY + 62, {
        size: 16, color: "rgba(15, 23, 42, 0.55)",
      });

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
