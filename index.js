import { getContext, extension_settings } from '../../../extensions.js';
import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { MEDIA_REQUEST_TYPE } from '../../../constants.js';
import { Popup } from '../../../popup.js';

let originalImages = [];
let currentImages = [];
let selectedImages = new Set();
let favoriteImages = new Set();
let isSelectMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;
let currentFolder = null;
let allFoldersCache = null;

function safeSaveSettings() {
    if (extension_settings) extension_settings.advGalleryFavs = [...favoriteImages];
    localStorage.setItem('advGalleryFavs', JSON.stringify([...favoriteImages]));
    if (typeof saveSettingsDebounced === 'function') saveSettingsDebounced();
}

const template = `
<div id="adv-gallery-popup">
    <button id="adv-btn-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>

    <div id="adv-gallery-controls" title="빈 공간을 드래그하면 창을 옮길 수 있어요 (더블클릭: 위치 초기화)">
        <div id="adv-btn-folder-picker" style="position:relative; font-weight:bold; color:var(--SmartThemeBodyColor); padding:5px 10px; background:rgba(255,255,255,0.05); border-radius:5px; cursor:pointer;">
            <span class="adv-folder-label">🖼 <span id="adv-gallery-folder-name"></span> <span id="adv-gallery-meta" style="color:#999; font-weight:normal; font-size:10px;">(0장, 0MB)</span> <i class="fa-solid fa-chevron-down" style="font-size:9px; opacity:0.6;"></i></span>

            <div id="adv-folder-picker" style="display:none;">
                <input type="text" id="adv-folder-search" placeholder="캐릭터 검색..." onclick="event.stopPropagation()">
                <div id="adv-folder-list"></div>
            </div>
        </div>

        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬">
            <option value="newest">최신순</option>
            <option value="oldest">오래된순</option>
        </select>

        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수">
            <option value="4">4장</option><option value="8" selected>8장</option><option value="20">20장</option><option value="custom">직접입력</option>
        </select>
        <input type="number" id="adv-grid-custom-input" min="1" max="200" placeholder="장수" style="display:none;">

        <div style="margin-left:auto; display:flex; gap:8px;">
            <button class="adv-ctrl-item adv-icon-btn" id="adv-btn-select" title="다중 선택 모드"><i class="fa-solid fa-list-check"></i></button>
        </div>
    </div>

    <div id="adv-selection-actions">
        <button class="adv-ctrl-item" id="adv-btn-sel-all"><i class="fa-solid fa-check-square"></i> 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel"><i class="fa-solid fa-trash"></i> 선택삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" title="즐겨찾기(별) 표시하지 않은 이미지만 전부 삭제합니다"><i class="fa-solid fa-star"></i> 즐겨찾기 제외 삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel"><i class="fa-solid fa-download"></i> 선택저장</button>
    </div>

    <div id="adv-gallery-container"></div>

    <div id="adv-pagination">
        <button class="adv-ctrl-item adv-icon-btn" id="adv-btn-prev-page"><i class="fa-solid fa-chevron-left"></i></button>
        <input type="number" id="adv-page-input" min="1" value="1">
        <span id="adv-page-total">/ 1</span>
        <button class="adv-ctrl-item adv-icon-btn" id="adv-btn-next-page"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>

<div id="adv-lightbox">
    <button class="adv-nav-btn" id="adv-nav-left"><i class="fa-solid fa-chevron-left"></i></button>
    <img id="adv-lightbox-img" src="">
    <div id="adv-lightbox-counter"></div>
    <button class="adv-nav-btn" id="adv-nav-right"><i class="fa-solid fa-chevron-right"></i></button>
</div>
`;

function addWandMenuButtons() {
    const initInterval = setInterval(() => {
        const menu = document.getElementById('extensionsMenu');
        if (menu) {
            if (!document.getElementById('adv-gallery-menu-btn')) {
                const btn = document.createElement('div');
                btn.id = 'adv-gallery-menu-btn';
                btn.className = 'list-group-item flex-container flexGap5';
                btn.innerHTML = '<div class="fa-solid fa-images extensionsMenuExtensionButton"></div><span>갤러리</span>';

                btn.addEventListener('click', function () {
                    document.getElementById('adv-gallery-popup').style.display = 'flex';
                    currentFolder = null;
                    loadCharacterFolderImages();
                    document.getElementById('extensionsMenuButton')?.click();
                });
                menu.appendChild(btn);
            }
            clearInterval(initInterval);
        }
    }, 500);
}

async function updateGalleryMeta(images) {
    const metaSpan = document.getElementById('adv-gallery-meta');
    if (!metaSpan) return;

    if (images.length === 0) {
        metaSpan.textContent = '(0장, 0MB)';
        return;
    }

    metaSpan.textContent = `(${images.length}장, 계산 중...)`;

    let totalSize = 0;
    const chunkSize = 20;
    try {
        for (let i = 0; i < images.length; i += chunkSize) {
            const chunk = images.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (src) => {
                try {
                    const res = await fetch(src, { method: 'HEAD' });
                    const size = res.headers.get('content-length');
                    if (size) totalSize += parseInt(size, 10);
                } catch (e) { /* skip unreadable entries */ }
            }));
        }
        const mb = (totalSize / (1024 * 1024)).toFixed(1);
        metaSpan.textContent = `(${images.length}장, ${mb}MB)`;
    } catch (e) {
        metaSpan.textContent = `(${images.length}장, 용량 계산 실패)`;
    }
}

async function fetchFolderList() {
    if (allFoldersCache) return allFoldersCache;
    try {
        const res = await fetch('/api/images/folders', {
            method: 'POST',
            headers: getRequestHeaders({ omitContentType: true }),
        });
        if (!res.ok) return [];
        allFoldersCache = await res.json();
        return allFoldersCache;
    } catch (e) {
        console.error('폴더 목록 조회 실패:', e);
        return [];
    }
}

async function hideIfEmptyFolder(folder, itemEl) {
    try {
        const res = await fetch('/api/images/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                folder: folder,
                sortField: 'date',
                sortOrder: 'desc',
                type: MEDIA_REQUEST_TYPE.IMAGE,
            }),
        });
        if (!res.ok) return;
        const files = await res.json();
        if (files.length === 0) itemEl.remove();
    } catch (e) {
        // 확인 실패 시엔 그냥 보이는 채로 둠
    }
}

function renderFolderList(filtered) {
    const listEl = document.getElementById('adv-folder-list');
    listEl.innerHTML = '';

    const homeItem = document.createElement('div');
    homeItem.className = 'adv-folder-item';
    homeItem.innerHTML = '🏠 현재 캐릭터로';
    homeItem.onclick = () => {
        currentFolder = null;
        document.getElementById('adv-folder-picker').style.display = 'none';
        loadCharacterFolderImages();
    };
    listEl.appendChild(homeItem);

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:8px; opacity:0.6; font-size:12px;';
        empty.textContent = '검색 결과 없음';
        listEl.appendChild(empty);
        return;
    }

    filtered.forEach(folder => {
        const item = document.createElement('div');
        item.className = 'adv-folder-item';
        item.textContent = folder;
        item.onclick = () => {
            currentFolder = folder;
            document.getElementById('adv-folder-picker').style.display = 'none';
            loadCharacterFolderImages();
        };
        listEl.appendChild(item);
        hideIfEmptyFolder(folder, item);
    });
}

async function toggleFolderPicker() {
    const picker = document.getElementById('adv-folder-picker');
    const isOpen = picker.style.display === 'block';
    if (isOpen) {
        picker.style.display = 'none';
        return;
    }

    const btnRect = document.getElementById('adv-btn-folder-picker').getBoundingClientRect();
    picker.style.top = `${btnRect.bottom + 6}px`;
    picker.style.left = `${btnRect.left}px`;
    picker.style.display = 'block';

    const listEl = document.getElementById('adv-folder-list');
    listEl.innerHTML = '<div style="padding:8px; opacity:0.6; font-size:12px;">불러오는 중...</div>';

    const folders = await fetchFolderList();
    renderFolderList(folders);

    const searchInput = document.getElementById('adv-folder-search');
    searchInput.value = '';
    searchInput.oninput = (e) => {
        const term = e.target.value.toLowerCase();
        renderFolderList(folders.filter(f => f.toLowerCase().includes(term)));
    };
}

async function loadCharacterFolderImages() {
    const container = document.getElementById('adv-gallery-container');
    const context = getContext();

    let folder = currentFolder;

    if (!folder) {
        if (context.groupId) {
            originalImages = [];
            currentImages = [];
            container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">그룹 채팅에서는 아직 지원되지 않습니다. 🖼 버튼으로 캐릭터를 직접 선택해주세요.</p>';
            updateGalleryMeta(originalImages);
            return;
        }
        folder = context.name2;
    }

    if (!folder) {
        originalImages = [];
        currentImages = [];
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">캐릭터를 먼저 선택해주세요.</p>';
        updateGalleryMeta(originalImages);
        return;
    }

    const folderNameEl = document.getElementById('adv-gallery-folder-name');
    if (folderNameEl) folderNameEl.textContent = folder;

    container.innerHTML = '<div class="adv-spinner" style="grid-column:1/-1;"></div>';

    const sortType = document.getElementById('adv-sort-select').value;
    const sortOrder = sortType === 'oldest' ? 'asc' : 'desc';

    try {
        const response = await fetch('/api/images/list', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({
                folder: folder,
                sortField: 'date',
                sortOrder: sortOrder,
                type: MEDIA_REQUEST_TYPE.IMAGE,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('이미지 목록 조회 실패:', response.status, errText);
            container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">이미지 목록을 불러오지 못했습니다. (콘솔 확인)</p>';
            originalImages = [];
            currentImages = [];
            updateGalleryMeta(originalImages);
            return;
        }

        const files = await response.json();
        originalImages = files.map(file => `user/images/${folder}/${file}`);
        currentImages = [...originalImages];
        updateGalleryMeta(originalImages);

        currentPage = 1;
        selectedImages.clear();
        document.getElementById('adv-sel-count').innerText = '0';

        if (originalImages.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">이 캐릭터 폴더에 이미지가 없습니다.</p>';
            return;
        }

        renderGrid();
    } catch (e) {
        console.error('이미지 목록 조회 에러:', e);
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">이미지 목록을 불러오는 중 오류가 발생했습니다.</p>';
    }
}

function computeTileMinSize(n) {
    if (n <= 4) return 220;
    if (n <= 8) return 150;
    if (n <= 20) return 110;
    return Math.max(70, Math.floor(700 / Math.sqrt(n)));
}

function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    if (!currentImages || currentImages.length === 0) return;

    container.innerHTML = '';
    container.style.setProperty('--tile-min', computeTileMinSize(itemsPerPage) + 'px');

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    document.getElementById('adv-page-input').value = currentPage;
    document.getElementById('adv-page-input').max = totalPages;
    document.getElementById('adv-page-total').textContent = `/ ${totalPages}`;

    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageImages = currentImages.slice(startIdx, startIdx + itemsPerPage);

    pageImages.forEach((src, idx) => {
        const card = document.createElement('div');
        card.className = `adv-img-card ${selectedImages.has(src) ? 'selected' : ''}`;

        const favBtn = document.createElement('button');
        const isFav = favoriteImages.has(src);
        favBtn.className = `adv-btn-fav ${isFav ? 'active' : ''}`;
        favBtn.innerHTML = isFav ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';

        favBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (favoriteImages.has(src)) favoriteImages.delete(src);
            else favoriteImages.add(src);

            safeSaveSettings();

            const nowFav = favoriteImages.has(src);
            favBtn.classList.toggle('active', nowFav);
            favBtn.innerHTML = nowFav ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
        };

        const img = document.createElement('img');
        img.src = src;
        img.onerror = () => {
            originalImages = originalImages.filter(i => i !== src);
            currentImages = currentImages.filter(i => i !== src);
            card.remove();
            updateGalleryMeta(originalImages);
        };

        card.appendChild(favBtn);
        card.appendChild(img);

        card.onclick = () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) {
                    selectedImages.delete(src);
                } else {
                    selectedImages.add(src);
                }
                document.getElementById('adv-sel-count').innerText = selectedImages.size;
                renderGrid();
            } else {
                currentLightboxIndex = startIdx + idx;
                openLightbox();
            }
        };
        container.appendChild(card);
    });
}

// ---------------------------------------------------------------------
// 창 드래그 이동 (PC 전용) — 헤더 바 빈 공간을 손잡이로 사용
// ---------------------------------------------------------------------
const DRAG_POS_STORAGE_KEY = 'advGalleryPos';

function saveGalleryPosition(popup) {
    try {
        localStorage.setItem(DRAG_POS_STORAGE_KEY, JSON.stringify({
            top: popup.style.top,
            left: popup.style.left,
        }));
    } catch (e) { /* ignore */ }
}

function restoreGalleryPosition(popup) {
    try {
        const raw = localStorage.getItem(DRAG_POS_STORAGE_KEY);
        if (!raw) return;
        const saved = JSON.parse(raw);
        if (saved && saved.top && saved.left) {
            popup.style.top = saved.top;
            popup.style.left = saved.left;
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
        }
    } catch (e) { /* ignore */ }
}

function resetGalleryPosition(popup) {
    popup.style.top = '';
    popup.style.left = '';
    popup.style.right = '';
    popup.style.bottom = '';
    try {
        localStorage.removeItem(DRAG_POS_STORAGE_KEY);
    } catch (e) { /* ignore */ }
}

function clampGalleryPosition(popup) {
    const minVisible = 60;
    const rect = popup.getBoundingClientRect();
    const maxLeft = window.innerWidth - minVisible;
    const maxTop = window.innerHeight - 30;

    let left = Math.min(rect.left, maxLeft);
    let top = Math.min(rect.top, maxTop);
    left = Math.max(left, minVisible - rect.width);
    top = Math.max(top, 0);

    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;
}

function makeGalleryDraggable() {
    const popup = document.getElementById('adv-gallery-popup');
    const handle = document.getElementById('adv-gallery-controls');
    if (!popup || !handle) return;

    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    handle.addEventListener('mousedown', (e) => {
        // 버튼/셀렉트/인풋/폴더선택 위에서는 드래그 시작하지 않음 (원래 기능이 우선)
        if (e.target.closest('button, input, select, a, #adv-btn-folder-picker')) return;
        if (e.button !== 0) return;

        const rect = popup.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;

        popup.style.left = `${rect.left}px`;
        popup.style.top = `${rect.top}px`;
        popup.style.right = 'auto';
        popup.style.bottom = 'auto';

        isDragging = true;
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;

        const minVisible = 60;
        const maxLeft = window.innerWidth - minVisible;
        const maxTop = window.innerHeight - 30;

        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;

        newLeft = Math.min(Math.max(newLeft, minVisible - popup.offsetWidth), maxLeft);
        newTop = Math.min(Math.max(newTop, 0), maxTop);

        popup.style.left = `${newLeft}px`;
        popup.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        document.body.style.userSelect = '';
        saveGalleryPosition(popup);
    });

    handle.addEventListener('dblclick', (e) => {
        if (e.target.closest('button, input, select, a, #adv-btn-folder-picker')) return;
        resetGalleryPosition(popup);
    });

    window.addEventListener('resize', () => {
        if (popup.style.display === 'none' || !popup.style.left) return;
        clampGalleryPosition(popup);
    });
}

function bindEvents() {
    document.getElementById('adv-btn-folder-picker').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFolderPicker();
    });

    document.getElementById('adv-btn-close').onclick = () => {
        document.getElementById('adv-gallery-popup').style.display = 'none';
        isSelectMode = false;
        document.getElementById('adv-btn-select').classList.remove('active');
        document.getElementById('adv-selection-actions').style.display = 'none';
    };

    document.getElementById('adv-sort-select').onchange = () => {
        loadCharacterFolderImages();
    };

    document.getElementById('adv-grid-select').onchange = (e) => {
        const customInput = document.getElementById('adv-grid-custom-input');
        if (e.target.value === 'custom') {
            customInput.style.display = 'inline-block';
            customInput.value = itemsPerPage;
            customInput.focus();
            customInput.select();
        } else {
            customInput.style.display = 'none';
            itemsPerPage = parseInt(e.target.value);
            currentPage = 1;
            renderGrid();
        }
    };

    document.getElementById('adv-grid-custom-input').addEventListener('change', (e) => {
        let value = parseInt(e.target.value, 10);
        if (!value || value < 1) value = 1;
        if (value > 200) value = 200;
        itemsPerPage = value;
        currentPage = 1;
        renderGrid();
    });

    document.getElementById('adv-btn-prev-page').onclick = () => { if (currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if (currentPage < Math.ceil(currentImages.length / itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-page-input').addEventListener('change', (e) => {
        const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
        let target = parseInt(e.target.value, 10) || 1;
        target = Math.min(Math.max(target, 1), totalPages);
        currentPage = target;
        renderGrid();
    });

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.currentTarget.classList.toggle('active', isSelectMode);
        document.getElementById('adv-selection-actions').style.display = isSelectMode ? 'flex' : 'none';
        selectedImages.clear();
        document.getElementById('adv-sel-count').innerText = '0';
        renderGrid();
    };

    document.getElementById('adv-btn-sel-all').onclick = () => {
        currentImages.forEach(src => selectedImages.add(src));
        document.getElementById('adv-sel-count').innerText = selectedImages.size;
        renderGrid();
    };

    document.getElementById('adv-btn-del-sel').onclick = () => deleteTargetImages(Array.from(selectedImages));

    document.getElementById('adv-btn-del-unsel').onclick = () => {
        const toDelete = currentImages.filter(src => !favoriteImages.has(src));
        deleteTargetImages(toDelete);
    };

    document.getElementById('adv-btn-save-sel').onclick = () => {
        if (selectedImages.size === 0) { toastr.warning('저장할 이미지를 선택해주세요.'); return; }
        selectedImages.forEach(src => {
            const a = document.createElement('a');
            a.href = src;
            a.download = src.split('/').pop();
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    };

    document.getElementById('adv-nav-left').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
    document.getElementById('adv-nav-right').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
    document.getElementById('adv-lightbox').onclick = (e) => { if (e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };

    document.addEventListener('mousedown', (e) => {
        const picker = document.getElementById('adv-folder-picker');
        const pickerBtn = document.getElementById('adv-btn-folder-picker');
        if (picker.style.display === 'block' && !picker.contains(e.target) && !pickerBtn.contains(e.target)) {
            picker.style.display = 'none';
        }
    });

    let touchStartX = 0;
    const lightbox = document.getElementById('adv-lightbox');
    lightbox.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    lightbox.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const delta = touchEndX - touchStartX;
        if (Math.abs(delta) > 50) {
            navLightbox(delta < 0 ? 1 : -1);
        }
    }, { passive: true });

    document.addEventListener('keydown', (e) => {
        const lightboxOpen = lightbox.style.display === 'flex';
        const popupOpen = document.getElementById('adv-gallery-popup').style.display === 'flex';

        if (e.key === 'Escape') {
            if (lightboxOpen) lightbox.style.display = 'none';
            else if (popupOpen) document.getElementById('adv-btn-close').click();
        } else if (lightboxOpen && e.key === 'ArrowLeft') {
            navLightbox(-1);
        } else if (lightboxOpen && e.key === 'ArrowRight') {
            navLightbox(1);
        }
    });
}

function openLightbox() {
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
    document.getElementById('adv-lightbox-counter').textContent = `${currentLightboxIndex + 1} / ${currentImages.length}`;
    document.getElementById('adv-lightbox').style.display = 'flex';
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
    document.getElementById('adv-lightbox-counter').textContent = `${currentLightboxIndex + 1} / ${currentImages.length}`;
}

async function deleteTargetImages(targetArray) {
    if (targetArray.length === 0) {
        toastr.warning('삭제 대상 이미지가 없습니다. (모두 즐겨찾기로 보호되어 있을 수 있습니다.)');
        return;
    }

    const confirmed = await Popup.show.confirm(`총 ${targetArray.length}장의 이미지를 서버에서 완전히 삭제합니다. 진행할까요?`, '이미지 삭제');
    if (!confirmed) return;

    const headers = getRequestHeaders();

    let failCount = 0;

    for (let src of targetArray) {
        try {
            const res = await fetch('/api/images/delete', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ path: src })
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error('삭제 실패:', src, res.status, errText);
                failCount++;
                continue;
            }
            originalImages = originalImages.filter(img => img !== src);
            currentImages = currentImages.filter(img => img !== src);
        } catch (e) {
            console.error('삭제 요청 에러:', e);
            failCount++;
        }
    }

    selectedImages.clear();
    document.getElementById('adv-sel-count').innerText = '0';

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    renderGrid();
    updateGalleryMeta(originalImages);

    if (failCount > 0) {
        toastr.error(`${targetArray.length - failCount}장 삭제 완료, ${failCount}장은 실패했습니다. (콘솔 확인)`);
    } else {
        toastr.success('삭제 완료! 채팅창의 엑박을 치우려면 메시지를 새로고침/수정해야 합니다.');
    }
}

jQuery(function () {
    let loadedFavs = [];
    if (extension_settings && extension_settings.advGalleryFavs) {
        loadedFavs = extension_settings.advGalleryFavs;
    } else {
        loadedFavs = JSON.parse(localStorage.getItem('advGalleryFavs')) || [];
    }
    favoriteImages = new Set(loadedFavs);

    document.body.insertAdjacentHTML('beforeend', template);
    document.body.appendChild(document.getElementById('adv-folder-picker'));
    addWandMenuButtons();
    bindEvents();

    const popup = document.getElementById('adv-gallery-popup');
    if (window.innerWidth > 768) {
        restoreGalleryPosition(popup);
        makeGalleryDraggable();
    }
});
