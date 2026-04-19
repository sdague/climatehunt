(function () {
    'use strict';

    const STORAGE_KEY = 'climatehunt-progress';
    const REFRESH_INTERVAL = 30 * 60 * 1000;
    const MAX_THUMB_DIM = 800;
    const MAX_SHARE_DIM = 1200;

    let challengeData = null;
    let progress = loadProgress();
    let currentTab = 'today';

    function loadProgress() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                return {
                    completedItems: parsed.completedItems || [],
                    photos: parsed.photos || {}
                };
            }
        } catch (e) { /* ignore corrupt data */ }
        return { completedItems: [], photos: {} };
    }

    function saveProgress() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                const oldest = Object.keys(progress.photos)[0];
                if (oldest) {
                    delete progress.photos[oldest];
                    saveProgress();
                }
            }
        }
    }

    function todayString() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function getScheduledChallenges() {
        if (!challengeData || !challengeData.schedule) return { current: null, next: null };
        const today = todayString();
        const sorted = challengeData.schedule.slice().sort(function (a, b) {
            return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
        });

        var currentEntry = null;
        var nextEntry = null;

        for (var i = 0; i < sorted.length; i++) {
            if (sorted[i].date === today) {
                currentEntry = sorted[i];
                if (i + 1 < sorted.length) nextEntry = sorted[i + 1];
                break;
            }
            if (sorted[i].date < today) {
                currentEntry = sorted[i];
                if (i + 1 < sorted.length && sorted[i + 1].date <= today) {
                    continue;
                }
                if (i + 1 < sorted.length) nextEntry = sorted[i + 1];
            }
        }

        if (!currentEntry && sorted.length > 0 && sorted[0].date > today) {
            nextEntry = sorted[0];
        }

        return {
            current: currentEntry ? findItemById(currentEntry.challengeId) : null,
            next: nextEntry ? findItemById(nextEntry.challengeId) : null
        };
    }

    function findItemById(id) {
        if (!challengeData) return null;
        for (const cat of challengeData.categories) {
            for (const item of cat.items) {
                if (item.id === id) {
                    return { ...item, category: cat.name };
                }
            }
        }
        return null;
    }

    function getAllItems() {
        if (!challengeData) return [];
        const items = [];
        for (const cat of challengeData.categories) {
            for (const item of cat.items) {
                items.push({ ...item, category: cat.name });
            }
        }
        return items;
    }

    function getCompletionStats() {
        const all = getAllItems();
        const total = all.length;
        const completed = progress.completedItems.length;
        return { total, completed, percent: total ? Math.round((completed / total) * 100) : 0 };
    }

    function toggleComplete(itemId) {
        const idx = progress.completedItems.indexOf(itemId);
        if (idx >= 0) {
            progress.completedItems.splice(idx, 1);
        } else {
            progress.completedItems.push(itemId);
        }
        saveProgress();
        render();
    }

    function resizeImage(file, maxDim) {
        return new Promise(function (resolve) {
            const reader = new FileReader();
            reader.onload = function (e) {
                const img = new Image();
                img.onload = function () {
                    let w = img.width;
                    let h = img.height;
                    if (w > maxDim || h > maxDim) {
                        if (w > h) {
                            h = Math.round(h * maxDim / w);
                            w = maxDim;
                        } else {
                            w = Math.round(w * maxDim / h);
                            h = maxDim;
                        }
                    }
                    const canvas = document.createElement('canvas');
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    canvas.toBlob(function (blob) {
                        resolve({ blob: blob, dataUrl: canvas.toDataURL('image/jpeg', 0.8) });
                    }, 'image/jpeg', 0.8);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function handlePhoto(itemId) {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.capture = 'environment';
        input.onchange = async function () {
            if (!input.files || !input.files[0]) return;
            const file = input.files[0];
            const thumb = await resizeImage(file, MAX_THUMB_DIM);
            progress.photos[itemId] = thumb.dataUrl;
            if (progress.completedItems.indexOf(itemId) < 0) {
                progress.completedItems.push(itemId);
            }
            saveProgress();
            render();
        };
        input.click();
    }

    function buildShareText(item) {
        var hashtag = (challengeData && challengeData.hashtag) || '#climatehunt';
        var message = (challengeData && challengeData.shareMessage) ||
            'Join the hunt at climatehunt.org';
        return 'I found "' + item.title + '" in the Climate Solutions Hunt! ' +
            message + ' ' + hashtag;
    }

    async function handleShare(itemId) {
        const item = findItemById(itemId);
        if (!item) return;

        const text = buildShareText(item);

        if (progress.photos[itemId]) {
            try {
                const resp = await fetch(progress.photos[itemId]);
                const blob = await resp.blob();
                const shareBlob = await resizeImage(
                    new File([blob], 'climate-hunt.jpg', { type: 'image/jpeg' }),
                    MAX_SHARE_DIM
                );
                const file = new File([shareBlob.blob], 'climate-hunt.jpg', { type: 'image/jpeg' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: item.title + ' — Climate Solutions Hunt',
                        text: text,
                        files: [file]
                    });
                    return;
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: item.title + ' — Climate Solutions Hunt',
                    text: text
                });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(text);
            showToast('Share text copied to clipboard!');
        } catch (e) {
            showToast('Could not share — copy this: ' + text);
        }
    }

    function showToast(message) {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.className = 'app-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        setTimeout(function () { toast.classList.remove('show'); }, 3000);
    }

    function linkifyHint(hint) {
        if (!hint) return '';
        return hint.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    }

    function renderChallengeCard(challenge, label) {
        const isComplete = progress.completedItems.indexOf(challenge.id) >= 0;
        const photo = progress.photos[challenge.id];

        return (label ? '<p class="challenge-label">' + escHtml(label) + '</p>' : '') +
            '<div class="challenge-card' + (isComplete ? ' completed' : '') + '">' +
                '<span class="category-badge">' + escHtml(challenge.category) + '</span>' +
                (challenge.bonus ? '<span class="bonus-badge">Bonus</span>' : '') +
                '<h2 class="challenge-title">' + escHtml(challenge.title) + '</h2>' +
                (challenge.hint ? '<p class="challenge-hint">' + linkifyHint(challenge.hint) + '</p>' : '') +
                (photo ? '<div class="photo-preview"><img src="' + photo + '" alt="Your photo"></div>' : '') +
                '<div class="challenge-actions">' +
                    '<button class="btn btn-camera" data-item="' + challenge.id + '">' +
                        '<i class="fas fa-camera"></i> Take Photo' +
                    '</button>' +
                    '<button class="btn btn-share" data-item="' + challenge.id + '"' + (photo ? '' : ' disabled') + '>' +
                        '<i class="fas fa-share-nodes"></i> Share' +
                    '</button>' +
                    '<button class="btn ' + (isComplete ? 'btn-completed' : 'btn-complete') + '" data-item="' + challenge.id + '">' +
                        '<i class="fas ' + (isComplete ? 'fa-check-circle' : 'fa-circle') + '"></i> ' +
                        (isComplete ? 'Done!' : 'Mark Complete') +
                    '</button>' +
                '</div>' +
            '</div>';
    }

    function renderTodayChallenge() {
        const container = document.getElementById('today-content');
        if (!container) return;

        const { current, next } = getScheduledChallenges();

        if (!current && !next) {
            container.innerHTML = '<p class="text-muted">No challenge scheduled yet. Check back soon!</p>';
            return;
        }

        var html = '';

        if (current) {
            var currentDone = progress.completedItems.indexOf(current.id) >= 0;
            html += renderChallengeCard(current, "Today's Challenge");

            if (currentDone && next) {
                html += renderChallengeCard(next, 'Up Next');
            }
        } else if (next) {
            html += renderChallengeCard(next, 'Up Next');
        }

        container.innerHTML = html;
    }

    function renderChecklist() {
        const container = document.getElementById('checklist-content');
        if (!container || !challengeData) return;

        const stats = getCompletionStats();
        let html =
            '<div class="progress-section">' +
                '<div class="progress-bar-wrap">' +
                    '<div class="progress-bar-fill" style="width:' + stats.percent + '%"></div>' +
                '</div>' +
                '<p class="progress-text">' + stats.completed + ' / ' + stats.total + ' found (' + stats.percent + '%)</p>' +
            '</div>';

        for (const cat of challengeData.categories) {
            html += '<div class="checklist-category">' +
                '<h3 class="category-heading">' + escHtml(cat.name) + '</h3>';

            for (const item of cat.items) {
                const isComplete = progress.completedItems.indexOf(item.id) >= 0;
                const photo = progress.photos[item.id];

                html += '<div class="checklist-item' + (isComplete ? ' completed' : '') + '">' +
                    '<div class="checklist-item-header">' +
                        '<button class="btn-check-toggle" data-item="' + item.id + '">' +
                            '<i class="fas ' + (isComplete ? 'fa-check-square' : 'fa-square') + '"></i>' +
                        '</button>' +
                        '<span class="checklist-item-title">' + escHtml(item.title) + '</span>' +
                        (item.bonus ? '<span class="bonus-badge-sm">Bonus</span>' : '') +
                    '</div>' +
                    (item.hint ? '<p class="checklist-hint">' + linkifyHint(item.hint) + '</p>' : '') +
                    (photo ? '<div class="photo-preview-sm"><img src="' + photo + '" alt="Your photo"></div>' : '') +
                    '<div class="checklist-item-actions">' +
                        '<button class="btn-sm btn-camera-sm" data-item="' + item.id + '">' +
                            '<i class="fas fa-camera"></i>' +
                        '</button>' +
                        '<button class="btn-sm btn-share-sm" data-item="' + item.id + '"' + (photo ? '' : ' disabled') + '>' +
                            '<i class="fas fa-share-nodes"></i>' +
                        '</button>' +
                    '</div>' +
                '</div>';
            }
            html += '</div>';
        }

        container.innerHTML = html;
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    function render() {
        renderTodayChallenge();
        renderChecklist();
    }

    function switchTab(tab) {
        currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        document.querySelectorAll('.tab-panel').forEach(function (panel) {
            panel.classList.toggle('active', panel.id === 'panel-' + tab);
        });
    }

    function setupEventDelegation() {
        document.addEventListener('click', function (e) {
            const target = e.target.closest('[data-item]');
            if (!target) return;

            const itemId = target.dataset.item;

            if (target.disabled) return;

            if (target.classList.contains('btn-camera') || target.classList.contains('btn-camera-sm')) {
                handlePhoto(itemId);
            } else if (target.classList.contains('btn-share') || target.classList.contains('btn-share-sm')) {
                handleShare(itemId);
            } else if (target.classList.contains('btn-complete') || target.classList.contains('btn-completed') || target.classList.contains('btn-check-toggle')) {
                toggleComplete(itemId);
            }
        });

        document.querySelectorAll('.tab-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                switchTab(btn.dataset.tab);
            });
        });

        var resetBtn = document.getElementById('btn-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', function () {
                if (confirm('Are you sure? This will erase all your progress and photos.')) {
                    progress = { completedItems: [], photos: {} };
                    saveProgress();
                    render();
                    showToast('Progress reset!');
                }
            });
        }
    }

    async function fetchChallenges() {
        try {
            const cacheBuster = Math.floor(Date.now() / (60 * 60 * 1000));
            const resp = await fetch('data/challenges.json?v=' + cacheBuster);
            if (resp.ok) {
                challengeData = await resp.json();
                render();
            }
        } catch (e) {
            console.error('Failed to load challenges:', e);
        }
    }

    function init() {
        setupEventDelegation();
        fetchChallenges();
        setInterval(fetchChallenges, REFRESH_INTERVAL);

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(function () {});
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
