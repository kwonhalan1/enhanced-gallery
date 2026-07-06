import { getContext, extension_settings, saveSettingsDebounced } from '../../../extensions.js';

let originalImages = []; 
let currentImages = []; 
let selectedImages = new Set();
let favoriteImages = new Set(); // 에러 유발하던 서버 읽기 코드를 밑으로 내리고 비워둠
let isSelectMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

const template = `
<div id="adv-gallery-popup">
    <button id="adv-btn-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>

    <div id="adv-gallery-controls">
        <div style="font-weight:bold; color:var(--SmartThemeBodyColor); padding:5px 10px; background:rgba(255,255,255,0.05); border-radius:5px;">
            💬 현재 채팅 갤러리
        </div>
        
        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬">
            <option value="newest">🕒 최신순</option>
            <option value="oldest">⏳ 오래된순</option>
        </select>
        
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수">
            <option value="4">🔲 4장 보기</option><option value="8" selected>🔲 8장 보기</option><option value="20">🔲 20장 보기</option>
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
                    loadCurrentChatImages();
                    document.getElementById('extensionsMenuButton')?.click();
                });
                menu.appendChild(btn);
            }
            clearInterval(initInterval);
        }
    }, 500);
}

function loadCurrentChatImages() {
    const container = document.getElementById('adv-gallery-container');
    const context = getContext();
    
    if (!context.chat || context.chat.length === 0) {
        originalImages = [];
        currentImages = [];
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">현재 채팅에 이미지가 없습니다.</p>';
        return;
    }

    let foundImages = new Set();
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;

    context.chat.forEach(msg => {
        if (msg.extra && msg.extra.image) {
            foundImages.add(msg.extra.image);
        }
        if (msg.mes) {
            let match;
            while ((match = imgRegex.exec(msg.mes)) !== null) {
                if (!match[1].startsWith('data:')) {
                    foundImages.add(match[1]);
                }
            }
        }
    });

    originalImages = Array.from(foundImages);

    if (originalImages.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">현재 채팅에 갤러리에 표시될 이미지가 없습니다.</p>';
        return;
    }

    applySortAndRender();
}

function applySortAndRender() {
    const sortType = document.getElementById('adv-sort-select').value;
    
    currentImages = [...originalImages];
    
    if (sortType === 'newest') {
        currentImages.reverse();
    }

    currentPage = 1;
    selectedImages.clear();
    document.getElementById('adv-sel-count').innerText = '0';
    
    renderGrid();
}

function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    if(!currentImages || currentImages.length === 0) return;
    
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
        favBtn.className = `adv-btn-fav ${favoriteImages.has(src) ? 'active' : ''}`;
        favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
        
        // 렌더링 시 노란색/흰색 지정
        favBtn.style.color = favoriteImages.has(src) ? '#ffd54f' : 'white'; 
        
        favBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (favoriteImages.has(src)) favoriteImages.delete(src); 
            else favoriteImages.add(src);
            
            // 서버 설정(settings.json)에 저장 후 딜레이 저장 적용
            extension_settings.advGalleryFavs = [...favoriteImages];
            saveSettingsDebounced();

            favBtn.classList.toggle('active');
            favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
            
            // 클릭 시 즉각적인 색상 변화 반영
            favBtn.style.color = favoriteImages.has(src) ? '#ffd54f' : 'white'; 
        };

        const img = document.createElement('img');
        img.src = src;
        
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
    document.getElementById('adv-btn-close').onclick = () => {
        document.getElementById('adv-gallery-popup').style.display = 'none';
        isSelectMode = false;
        document.getElementById('adv-btn-select').style.background = 'rgba(255,255,255,0.1)';
        document.getElementById('adv-selection-actions').style.display = 'none';
    };

    document.getElementById('adv-sort-select').onchange = () => {
        if(originalImages.length > 0) applySortAndRender();
    };
    
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

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
        if(selectedImages.size === 0) return alert('저장할 이미지를 선택해주세요.');
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
    document.getElementById('adv-lightbox').onclick = (e) => { if(e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
}

async function deleteTargetImages(targetArray) {
    if (targetArray.length === 0) return alert("삭제 대상 이미지가 없습니다.\n(모두 즐겨찾기로 보호되어 있을 수 있습니다.)");

    if (!confirm(`총 ${targetArray.length}장의 이미지를 서버에서 삭제합니다. 진행할까요?`)) return;

    const headers = typeof window.getRequestHeaders === 'function' 
        ? window.getRequestHeaders() 
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': getContext().csrf_token };

    for (let src of targetArray) {
        try {
            // path 대신 url 사용 (실제 서버에서 파일이 삭제되게 고침)
            await fetch('/api/images/delete', { 
                method: 'POST', 
                headers: headers, 
                body: JSON.stringify({ url: src }) 
            });
            originalImages = originalImages.filter(img => img !== src);
            currentImages = currentImages.filter(img => img !== src);
        } catch(e) { console.error(e); }
    }
    
    selectedImages.clear(); 
    document.getElementById('adv-sel-count').innerText = '0';
    
    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    renderGrid();
    alert('삭제 완료!\n(채팅창의 깨진 엑박을 지우려면 메시지를 새로고침/수정해야 합니다.)');
}

// ----------------------------------------------------
// ★ 여기로 옮겼습니다: 실리태번 로딩이 끝난 안전한 시점에 서버 데이터 불러오기
// ----------------------------------------------------
jQuery(function () {
    if (!extension_settings.advGalleryFavs) {
        extension_settings.advGalleryFavs = [];
    }
    favoriteImages = new Set(extension_settings.advGalleryFavs);

    document.body.insertAdjacentHTML('beforeend', template);
    addWandMenuButtons();
    bindEvents();
});
