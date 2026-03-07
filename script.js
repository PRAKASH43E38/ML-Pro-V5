// ===== Mobile Addiction Analyzer — script.js =====

(function () {
    'use strict';

    // ===== DOM References =====
    const form = document.getElementById('usageForm');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const btnText = document.getElementById('btnText');
    const spinner = document.getElementById('loadingSpinner');
    const placeholderCard = document.getElementById('placeholderCard');
    const resultsSection = document.getElementById('resultsSection');
    const chartSection = document.getElementById('chartSection');
    const toast = document.getElementById('toast');

    // Result elements
    const addictionEl = document.getElementById('addictionLevel');
    const screenTimeEl = document.getElementById('screenTime');
    const behaviorEl = document.getElementById('behaviorType');
    const meterFill = document.getElementById('meterFill');
    const meterValue = document.getElementById('meterValue');

    // Canvas
    const canvas = document.getElementById('analysisCanvas');
    const ctx = canvas.getContext('2d');

    // Field configs
    const fields = [
        { id: 'social_media_hours', min: 0, max: 24 },
        { id: 'gaming_hours', min: 0, max: 24 },
        { id: 'study_hours', min: 0, max: 24 },
        { id: 'sleep_hours', min: 0, max: 24 },
        { id: 'notifications_per_day', min: 0, max: 1000 }
    ];

    // Dataset averages (computed from the 3001-row CSV)
    const datasetAvg = {
        social_media_hours: 2.5,
        gaming_hours: 1.5,
        study_hours: 1.1,
        sleep_hours: 6.4,
        notifications_per_day: 87
    };

    let currentChart = 'bar';
    let lastResult = null;
    let lastInput = null;

    // ===== Validation =====
    function validateField(fieldId) {
        const input = document.getElementById(fieldId);
        const errorEl = document.getElementById(fieldId + '_error');
        const cfg = fields.find(f => f.id === fieldId);
        const val = parseFloat(input.value);
        const valid = input.value !== '' && !isNaN(val) && val >= cfg.min && val <= cfg.max;
        input.classList.toggle('error', !valid);
        errorEl.classList.toggle('visible', !valid);
        return valid;
    }

    function validateAll() {
        let allValid = true;
        fields.forEach(f => { if (!validateField(f.id)) allValid = false; });
        return allValid;
    }

    // Live validation
    fields.forEach(f => {
        const input = document.getElementById(f.id);
        input.addEventListener('blur', () => validateField(f.id));
        input.addEventListener('input', () => {
            if (input.classList.contains('error')) validateField(f.id);
        });
    });

    // ===== Toast =====
    function showToast(msg, type) {
        toast.textContent = msg;
        toast.className = 'toast ' + (type || '') + ' visible';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 4000);
    }

    // ===== Client-side Prediction (Fallback) =====
    function predictLocally(data) {
        const sm = data.social_media_hours;
        const gm = data.gaming_hours;
        const st = data.study_hours;
        const sl = data.sleep_hours;
        const nt = data.notifications_per_day;

        // Addiction score: weighted combination (0-10 scale)
        let score = 0;
        score += (sm / 10) * 2.5;           // social media weight
        score += (gm / 5) * 1.8;            // gaming weight
        score += ((24 - sl) / 24) * 1.5;    // less sleep = higher risk
        score += (nt / 150) * 2.2;          // notifications weight
        score -= (st / 5) * 1.0;            // study reduces score
        score = Math.max(0, Math.min(10, score));

        // Determine level label
        let level, levelClass;
        if (score <= 3.5) { level = 'Low'; levelClass = 'level-low'; }
        else if (score <= 6.5) { level = 'Moderate'; levelClass = 'level-moderate'; }
        else { level = 'High'; levelClass = 'level-high'; }

        // Predicted screen time
        const screenTime = Math.round((sm + gm + st + Math.max(0, (nt / 60))) * 10) / 10;

        // Behavior cluster
        let cluster;
        if (sm >= gm && sm >= st) cluster = 'Social Media Heavy';
        else if (gm >= sm && gm >= st) cluster = 'Gaming Focused';
        else cluster = 'Study Oriented';

        return {
            addiction_level: level,
            addiction_level_class: levelClass,
            addiction_score: Math.round(score * 10) / 10,
            predicted_screen_time: Math.min(screenTime, 16),
            user_cluster: cluster
        };
    }

    // ===== Loading State =====
    function setLoading(on) {
        analyzeBtn.disabled = on;
        btnText.textContent = on ? 'Analyzing...' : 'Analyze My Usage';
        spinner.classList.toggle('active', on);
        analyzeBtn.querySelector('svg').style.display = on ? 'none' : '';
    }

    // ===== Display Results =====
    function displayResults(result, inputData) {
        lastResult = result;
        lastInput = inputData;

        // Hide placeholder, show results
        placeholderCard.style.display = 'none';
        resultsSection.classList.add('visible');
        chartSection.classList.add('visible');

        // Fill result values
        addictionEl.textContent = result.addiction_level;
        addictionEl.className = 'result-item__value ' + (result.addiction_level_class || '');
        screenTimeEl.textContent = result.predicted_screen_time + 'h';
        behaviorEl.textContent = result.user_cluster;

        // Meter
        const pct = Math.round((result.addiction_score / 10) * 100);
        meterValue.textContent = pct + '%';
        setTimeout(() => { meterFill.style.width = pct + '%'; }, 100);

        // Draw chart
        drawChart(currentChart);
        showToast('Analysis complete!', 'success');
    }

    // ===== Form Submit =====
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!validateAll()) {
            showToast('Please fix the errors above', 'error');
            return;
        }

        const data = {};
        fields.forEach(f => { data[f.id] = parseFloat(document.getElementById(f.id).value); });

        setLoading(true);

        try {
            const res = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error('Server error');
            const json = await res.json();
            // Enrich with score if not present
            if (json.addiction_score === undefined) {
                const local = predictLocally(data);
                json.addiction_score = local.addiction_score;
                json.addiction_level_class = local.addiction_level_class;
            }
            displayResults(json, data);
        } catch (err) {
            // Fallback to client-side prediction
            console.warn('Backend unavailable, using client-side prediction:', err.message);
            await new Promise(r => setTimeout(r, 800)); // simulate delay
            const result = predictLocally(data);
            displayResults(result, data);
        } finally {
            setLoading(false);
        }
    });

    // ===== Chart Tabs =====
    document.querySelectorAll('.chart-tab').forEach(tab => {
        tab.addEventListener('click', function () {
            document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentChart = this.dataset.chart;
            if (lastResult) drawChart(currentChart);
        });
    });

    // ===== Canvas Drawing Utilities =====
    function dpr() { return window.devicePixelRatio || 1; }

    function setupCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        const w = rect.width || 520;
        const h = 320;
        const r = dpr();
        canvas.width = w * r;
        canvas.height = h * r;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(r, 0, 0, r, 0, 0);
        return { w, h };
    }

    function drawChart(type) {
        const { w, h } = setupCanvas();
        ctx.clearRect(0, 0, w, h);
        if (type === 'bar') drawBarChart(w, h);
        else if (type === 'radar') drawRadarChart(w, h);
        else drawComparisonChart(w, h);
    }

    // ===== Bar Chart =====
    function drawBarChart(w, h) {
        if (!lastInput) return;
        const labels = ['Social Media', 'Gaming', 'Study', 'Sleep', 'Notifications'];
        const vals = [
            lastInput.social_media_hours,
            lastInput.gaming_hours,
            lastInput.study_hours,
            lastInput.sleep_hours,
            lastInput.notifications_per_day / 40
        ];
        const colors = ['#818CF8', '#C084FC', '#34D399', '#60A5FA', '#FBBF24'];
        const pad = { top: 30, bottom: 50, left: 20, right: 20 };
        const barW = (w - pad.left - pad.right) / labels.length - 16;
        const maxVal = Math.max(...vals, 1);
        const chartH = h - pad.top - pad.bottom;

        // Title
        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 12px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText('Your Usage Breakdown (hours / scaled)', w / 2, 18);

        labels.forEach((label, i) => {
            const x = pad.left + i * ((w - pad.left - pad.right) / labels.length) + 8;
            const barH = (vals[i] / maxVal) * chartH;
            const y = pad.top + chartH - barH;

            // Bar with rounded top
            const r = Math.min(6, barW / 2);
            ctx.beginPath();
            ctx.moveTo(x, y + r);
            ctx.arcTo(x, y, x + r, y, r);
            ctx.arcTo(x + barW, y, x + barW, y + r, r);
            ctx.lineTo(x + barW, pad.top + chartH);
            ctx.lineTo(x, pad.top + chartH);
            ctx.closePath();
            const grad = ctx.createLinearGradient(x, y, x, pad.top + chartH);
            grad.addColorStop(0, colors[i]);
            grad.addColorStop(1, colors[i] + '33');
            ctx.fillStyle = grad;
            ctx.fill();

            // Value
            ctx.fillStyle = '#E2E8F0';
            ctx.font = '600 11px Poppins';
            ctx.textAlign = 'center';
            ctx.fillText(i === 4 ? Math.round(vals[i] * 40) : vals[i].toFixed(1), x + barW / 2, y - 8);

            // Label
            ctx.fillStyle = '#64748B';
            ctx.font = '400 10px Poppins';
            ctx.fillText(label, x + barW / 2, h - 20);
        });
    }

    // ===== Radar Chart =====
    function drawRadarChart(w, h) {
        if (!lastInput) return;
        const cx = w / 2, cy = h / 2 + 10;
        const radius = Math.min(w, h) * 0.33;
        const labels = ['Social\nMedia', 'Gaming', 'Study', 'Sleep', 'Notif.'];
        const maxVals = [10, 5, 5, 10, 150];
        const vals = [
            lastInput.social_media_hours,
            lastInput.gaming_hours,
            lastInput.study_hours,
            lastInput.sleep_hours,
            lastInput.notifications_per_day
        ];
        const n = labels.length;
        const step = (Math.PI * 2) / n;

        // Title
        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 12px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText('Behavior Radar Profile', w / 2, 18);

        // Grid rings
        for (let ring = 1; ring <= 4; ring++) {
            const r = (ring / 4) * radius;
            ctx.beginPath();
            for (let i = 0; i <= n; i++) {
                const angle = i * step - Math.PI / 2;
                const px = cx + r * Math.cos(angle);
                const py = cy + r * Math.sin(angle);
                i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
            }
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Axis lines
        for (let i = 0; i < n; i++) {
            const angle = i * step - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.stroke();
        }

        // Data polygon
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const v = Math.min(vals[i] / maxVals[i], 1);
            const angle = i * step - Math.PI / 2;
            const px = cx + v * radius * Math.cos(angle);
            const py = cy + v * radius * Math.sin(angle);
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(99, 102, 241, 0.2)';
        ctx.fill();
        ctx.strokeStyle = '#818CF8';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Points and labels
        for (let i = 0; i < n; i++) {
            const v = Math.min(vals[i] / maxVals[i], 1);
            const angle = i * step - Math.PI / 2;
            const px = cx + v * radius * Math.cos(angle);
            const py = cy + v * radius * Math.sin(angle);
            ctx.beginPath();
            ctx.arc(px, py, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#818CF8';
            ctx.fill();

            const lx = cx + (radius + 22) * Math.cos(angle);
            const ly = cy + (radius + 22) * Math.sin(angle);
            ctx.fillStyle = '#94A3B8';
            ctx.font = '400 10px Poppins';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const lines = labels[i].split('\n');
            lines.forEach((line, j) => ctx.fillText(line, lx, ly + j * 13));
        }
    }

    // ===== Comparison Chart =====
    function drawComparisonChart(w, h) {
        if (!lastInput) return;
        const labels = ['Social Media', 'Gaming', 'Study', 'Sleep'];
        const userVals = [lastInput.social_media_hours, lastInput.gaming_hours, lastInput.study_hours, lastInput.sleep_hours];
        const avgVals = [datasetAvg.social_media_hours, datasetAvg.gaming_hours, datasetAvg.study_hours, datasetAvg.sleep_hours];
        const pad = { top: 40, bottom: 60, left: 20, right: 20 };
        const barW = 24;
        const gap = (w - pad.left - pad.right) / labels.length;
        const maxVal = Math.max(...userVals, ...avgVals, 1);
        const chartH = h - pad.top - pad.bottom;

        ctx.fillStyle = '#94A3B8';
        ctx.font = '500 12px Poppins';
        ctx.textAlign = 'center';
        ctx.fillText('Your Usage vs Dataset Average', w / 2, 20);

        labels.forEach((label, i) => {
            const groupX = pad.left + i * gap + gap / 2;

            // User bar
            const uH = (userVals[i] / maxVal) * chartH;
            const uX = groupX - barW - 3;
            const uY = pad.top + chartH - uH;
            drawRoundBar(uX, uY, barW, uH, '#818CF8', pad.top + chartH);

            // Avg bar
            const aH = (avgVals[i] / maxVal) * chartH;
            const aX = groupX + 3;
            const aY = pad.top + chartH - aH;
            drawRoundBar(aX, aY, barW, aH, '#64748B', pad.top + chartH);

            // Values
            ctx.fillStyle = '#E2E8F0';
            ctx.font = '600 10px Poppins';
            ctx.textAlign = 'center';
            ctx.fillText(userVals[i].toFixed(1), uX + barW / 2, uY - 6);
            ctx.fillStyle = '#94A3B8';
            ctx.fillText(avgVals[i].toFixed(1), aX + barW / 2, aY - 6);

            // Label
            ctx.fillStyle = '#64748B';
            ctx.font = '400 10px Poppins';
            ctx.fillText(label, groupX, h - 28);
        });

        // Legend
        const ly = h - 10;
        ctx.fillStyle = '#818CF8';
        ctx.fillRect(w / 2 - 80, ly - 6, 10, 10);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '400 10px Poppins';
        ctx.textAlign = 'left';
        ctx.fillText('You', w / 2 - 66, ly + 3);
        ctx.fillStyle = '#64748B';
        ctx.fillRect(w / 2 + 10, ly - 6, 10, 10);
        ctx.fillStyle = '#94A3B8';
        ctx.fillText('Average', w / 2 + 24, ly + 3);
    }

    function drawRoundBar(x, y, bw, bh, color, bottom) {
        const r = Math.min(5, bw / 2, bh / 2);
        if (bh < 2) return;
        ctx.beginPath();
        ctx.moveTo(x, bottom);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.arcTo(x + bw, y, x + bw, y + r, r);
        ctx.lineTo(x + bw, bottom);
        ctx.closePath();
        const grad = ctx.createLinearGradient(x, y, x, bottom);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '22');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // ===== Resize =====
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => { if (lastResult) drawChart(currentChart); }, 200);
    });

})();
