import { getContext, extension_settings } from '../../../extensions.js';
import { getRequestHeaders, saveSettingsDebounced } from '../../../../script.js';
import { MEDIA_REQUEST_TYPE } from '../../../constants.js';

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

    <div id="adv-gallery-controls">
        <div id="adv-btn-folder-picker" style="position:relative; font-weight:bold; color:var(--SmartThemeBodyColor); padding:5px 10px; background:rgba(255,255,255,0.05); border-radius:5px; white-space:nowrap; cursor:pointer;">
            🖼 <span id="adv-gallery-folder-name"></span> <span id="adv-gallery-meta" style="color:#999; font-weight:normal; font-size:10px;">(0장, 0MB)</span>

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
            <option value="4">4장</option><option value="8" selected>8장</option><option value="20">20장</option>
        </select>

        <div style="margin-left:auto; display:flex; gap:8px;">
            <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드"><i class="fa-solid fa-check-double"></i></button>
        </div>
    </div>

    <div id="adv-selection-actions">
        <button class="adv-ctrl-item" id="adv-btn-sel-all"><i class="fa-solid fa-check-square"></i> 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel"><i class="fa-solid fa-trash"></i> 선택삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel"><i class="fa-solid fa-star"></i> ★제외삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel"><i class="fa-solid fa-download"></i> 선택저장</button>
    </div>

    <div id="adv-gallery-container"></div>

    <div id="adv-pagination">
        <button class="adv-ctrl-item" id="adv-btn-prev-page"><i class="fa-solid fa-chevron-left"></i></button>
        <span id="adv-page-info">1 / 1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>

<div id="adv-lightbox">
    <button class="adv-nav-btn" id="adv-nav-left"><i class="fa-solid fa-chevron-left"></i></button>
    <img id="adv-lightbox-img" src="">
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
    });
}

async function toggleFolderPicker() {
    const picker = document.getElementById('adv-folder-picker');
    const isOpen = picker.style.display === 'block';
    if (isOpen) {
        picker.style.display = 'none';
        return;
    }

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

function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    if (!currentImages || currentImages.length === 0) return;

    container.innerHTML = '';
    container.style.setProperty('--columns', itemsPerPage == 4 ? 2 : (itemsPerPage == 8 ? 4 : 6));

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    document.getElementById('adv-page-info').textContent = `${currentPage} / ${totalPages}`;

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
                document.getElementById('adv-lightbox-img').src = src;
                document.getElementById('adv-lightbox').style.display = 'flex';
            }
        };
        container.appendChild(card);
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
        document.getElementById('adv-btn-select').style.background = 'rgba(255,255,255,0.1)';
        document.getElementById('adv-selection-actions').style.display = 'none';
    };

    document.getElementById('adv-sort-select').onchange = () => {
        loadCharacterFolderImages();
    };

    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if (currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if (currentPage < Math.ceil(currentImages.length / itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.currentTarget.style.background = isSelectMode ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.1)';
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
        if (selectedImages.size === 0) return alert('저장할 이미지를 선택해주세요.');
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
        if (picker.style.display === 'block' && !pickerBtn.contains(e.target)) {
            picker.style.display = 'none';
        }
    });

    document.addEventListener('mousedown', (e) => {
        const popup = document.getElementById('adv-gallery-popup');
        const menuBtn = document.getElementById('adv-gallery-menu-btn');
        if (
            popup.style.display === 'flex' &&
            !popup.contains(e.target) &&
            !(menuBtn && menuBtn.contains(e.target))
        ) {
            document.getElementById('adv-btn-close').click();
        }
    });
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
}

async function deleteTargetImages(targetArray) {
    if (targetArray.length === 0) return alert("삭제 대상 이미지가 없습니다.\n(모두 즐겨찾기로 보호되어 있을 수 있습니다.)");

    if (!confirm(`총 ${targetArray.length}장의 이미지를 서버에서 완전히 삭제합니다. 진행할까요?`)) return;

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

    if (failCount > 0) {
        alert(`${targetArray.length - failCount}장 삭제 완료, ${failCount}장은 실패했습니다.\n콘솔(F12)에서 에러 내용을 확인해주세요.`);
    } else {
        alert('삭제 완료!\n(서버에서 지워졌으므로, 채팅창의 엑박을 치우려면 메시지를 새로고침/수정해야 합니다.)');
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
    addWandMenuButtons();
    bindEvents();
});
