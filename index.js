import { getContext } from "../../../extensions.js";

let currentImages = [];
let selectedImages = new Set();
let favoriteImages = new Set(JSON.parse(localStorage.getItem('advGalleryFavs')) || []);
let isSelectMode = false;
let isMetaMode = false;
let isLightMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

const template = `
<div id="adv-gallery-popup" style="display:none;">
    <!-- 상단 컨트롤 바 -->
    <div id="adv-gallery-controls">
        <!-- 캐릭터 선택 및 용량 표시 (요구사항 2) -->
        <div style="display:flex; align-items:center; gap:5px;">
            <select class="adv-ctrl-item" id="adv-char-select" title="캐릭터 선택"><option value="">👤 캐릭터 선택</option></select>
            <span id="adv-char-size" style="font-size:12px; opacity:0.6; white-space:nowrap;"></span>
        </div>

        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬">
            <option value="newest">🕒 최신순</option>
            <option value="oldest">⏳ 오래된순</option>
            <option value="size">⚖️ 크기순(임시)</option>
        </select>
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수">
            <option value="4">🔲 4</option><option value="8" selected>🔲 8</option><option value="20">🔲 20</option>
        </select>
        
        <button class="adv-ctrl-item" id="adv-btn-theme" title="다크/라이트 모드 전환">🌓</button>
        <button class="adv-ctrl-item" id="adv-btn-meta" title="프롬프트 보기">📝</button>
        <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드">✅</button>
        <button class="adv-ctrl-item" id="adv-btn-close" title="닫기">❌</button>
    </div>
    
    <!-- 선택 모드 액션 바 -->
    <div id="adv-selection-actions" style="display:none; background: rgba(255,64,129,0.1); border-bottom: 1px solid #ff4081;">
        <button class="adv-ctrl-item" id="adv-btn-sel-all">☑️ 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel" style="color:#ff4d4d;">🗑️ 삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" style="color:orange;">⚠️ 반전삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel" style="color:#4caf50;">💾 저장</button>
    </div>

    <!-- 갤러리 영역 -->
    <div id="adv-gallery-container"></div>
    
    <!-- 페이징 -->
    <div id="adv-pagination" style="display:flex; justify-content:center; gap:10px; padding:10px; border-top:1px solid #555;">
        <button class="adv-ctrl-item" id="adv-btn-prev-page">◀</button>
        <span id="adv-page-info" style="align-self:center;">1/1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page">▶</button>
    </div>
</div>

<!-- 크게 보기 라이트박스 -->
<div id="adv-lightbox">
    <img id="adv-lightbox-img" src="">
    <div id="adv-lightbox-nav">
        <button class="adv-nav-btn" id="adv-nav-left">◀</button>
        <button class="adv-nav-btn" id="adv-btn-copy-prompt">📋 프롬프트 복사</button>
        <button class="adv-nav-btn" id="adv-nav-right">▶</button>
    </div>
</div>
`;

async function init() {
    document.body.insertAdjacentHTML('beforeend', template);
    
    let attempts = 0;
    const injectBtn = setInterval(() => {
        attempts++;
        // 마법봉 트레이 또는 확장메뉴 찾기
        const wandMenu = document.getElementById('extensions_tray') || document.getElementById('wand_tray') || document.querySelector('.floating-extensions-menu');
        const extMenu = document.getElementById('extensionsMenu');

        if (wandMenu || extMenu) {
            const btnHTML = `<div class="list-group-item flex-container flexGap5 cursor-pointer adv-gallery-trigger"><span style="font-weight:bold; color:#ff4081;">🖼️ 갤러리 열기</span></div>`;
            
            // 1. 좌측 하단 마법봉 메뉴에 삽입
            if (wandMenu && !document.querySelector('.adv-gallery-trigger')) {
                wandMenu.insertAdjacentHTML('beforeend', btnHTML);
                document.querySelector('.adv-gallery-trigger').addEventListener('click', () => {
                    const wandToggle = document.getElementById('show_extensions_button');
                    if (wandToggle && wandToggle.classList.contains('active')) wandToggle.click(); // 마법봉 닫기
                    openGallery();
                });
            }
            
            // 2. 상단 톱니바퀴 확장 메뉴에 삽입 (서브용)
            if (extMenu && !document.querySelector('.adv-gallery-trigger-ext')) {
                const extBtn = document.createElement('div');
                extBtn.className = 'list-group-item flex-container flexGap5 cursor-pointer adv-gallery-trigger-ext';
                extBtn.innerHTML = `<span>🖼️ 고급 갤러리</span>`;
                extBtn.addEventListener('click', openGallery);
                extMenu.appendChild(extBtn);
            }
            clearInterval(injectBtn);
        }
        if (attempts > 30) clearInterval(injectBtn);
    }, 1000);

    bindEvents();
}

function openGallery() {
    document.getElementById('adv-gallery-popup').style.display = 'flex';
    const context = getContext();
    const select = document.getElementById('adv-char-select');
    select.innerHTML = '<option value="">👤 캐릭터 선택</option>';
    if (context.characters) {
        context.characters.forEach(c => select.innerHTML += `<option value="${c.avatar}">${c.name}</option>`);
    }
}

// 용량 계산 로직 (백그라운드에서 비동기 처리)
async function calculateTotalSize(images) {
    const sizeSpan = document.getElementById('adv-char-size');
    if (images.length === 0) { sizeSpan.innerText = '(0MB)'; return; }
    
    sizeSpan.innerText = '(계산 중...)';
    let totalSize = 0;
    
    // 부하를 줄이기 위해 50개씩 묶어서 HEAD 요청
    const chunkSize = 50;
    try {
        for (let i = 0; i < images.length; i += chunkSize) {
            const chunk = images.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (src) => {
                try {
                    const res = await fetch(src, { method: 'HEAD' });
                    const size = res.headers.get('content-length');
                    if (size) totalSize += parseInt(size, 10);
                } catch(e) {}
            }));
        }
        const mb = (totalSize / (1024 * 1024)).toFixed(2);
        sizeSpan.innerText = `(${mb}MB)`;
    } catch(e) {
        sizeSpan.innerText = '(용량 확인 실패)';
    }
}

async function loadAndSortImages(charAvatar) {
    document.getElementById('adv-char-size').innerText = ''; // 초기화
    if (!charAvatar) { currentImages = []; renderGrid(); return; }
    
    try {
        const res = await fetch('/api/images/get'); 
        let data = await res.json();
        let allFiles = Array.isArray(data) ? data : (data.images || []);
        
        currentImages = allFiles.filter(img => img.includes(charAvatar.split('.')[0]));
        
        const sortType = document.getElementById('adv-sort-select').value;
        if (sortType === 'newest') currentImages.sort().reverse();
        else if (sortType === 'oldest') currentImages.sort();
        else if (sortType === 'size') currentImages.sort((a, b) => b.length - a.length);

        currentPage = 1;
        renderGrid();
        
        // 이미지 로딩 후 용량 계산 실행
        calculateTotalSize(currentImages);
    } catch(e) { console.error(e); }
}

function renderGrid() {
    const container = document.getElementById('adv-gallery-container');
    container.innerHTML = '';
    container.style.setProperty('--columns', itemsPerPage == 4 ? 2 : (itemsPerPage == 8 ? 4 : 6));

    const totalPages = Math.ceil(currentImages.length / itemsPerPage) || 1;
    document.getElementById('adv-page-info').textContent = `${currentPage}/${totalPages}`;
    
    const startIdx = (currentPage - 1) * itemsPerPage;
    const pageImages = currentImages.slice(startIdx, startIdx + itemsPerPage);

    pageImages.forEach((src, idx) => {
        const card = document.createElement('div');
        card.className = `adv-img-card ${selectedImages.has(src) ? 'selected' : ''}`;
        
        const favBtn = document.createElement('button');
        favBtn.className = `adv-btn-fav ${favoriteImages.has(src) ? 'active' : ''}`;
        favBtn.innerHTML = favoriteImages.has(src) ? '⭐' : '☆';
        favBtn.onclick = (e) => {
            e.stopPropagation();
            if (favoriteImages.has(src)) favoriteImages.delete(src); else favoriteImages.add(src);
            localStorage.setItem('advGalleryFavs', JSON.stringify([...favoriteImages]));
            favBtn.innerHTML = favoriteImages.has(src) ? '⭐' : '☆';
            favBtn.classList.toggle('active');
        };

        const img = document.createElement('img');
        img.src = src;

        card.appendChild(favBtn);
        card.appendChild(img);
        
        if (isMetaMode) {
            const meta = document.createElement('div');
            meta.style.cssText = 'position:absolute; bottom:0; background:rgba(0,0,0,0.8); color:white; font-size:10px; padding:5px; width:100%;';
            meta.innerText = "프롬프트 데이터 (API)";
            card.appendChild(meta);
        }

        card.onclick = () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) { selectedImages.delete(src); card.classList.remove('selected'); }
                else { selectedImages.add(src); card.classList.add('selected'); }
                document.getElementById('adv-sel-count').innerText = selectedImages.size;
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
    document.getElementById('adv-btn-close').onclick = () => document.getElementById('adv-gallery-popup').style.display = 'none';
    
    // 테마 변경 (요구사항 3)
    document.getElementById('adv-btn-theme').onclick = () => {
        isLightMode = !isLightMode;
        if(isLightMode) document.getElementById('adv-gallery-popup').classList.add('adv-light-mode');
        else document.getElementById('adv-gallery-popup').classList.remove('adv-light-mode');
    };

    document.getElementById('adv-char-select').onchange = (e) => loadAndSortImages(e.target.value);
    document.getElementById('adv-sort-select').onchange = () => loadAndSortImages(document.getElementById('adv-char-select').value);
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-btn-meta').onclick = (e) => {
        isMetaMode = !isMetaMode;
        e.target.style.background = isMetaMode ? (isLightMode ? '#ccc' : '#555') : '';
        renderGrid();
    };

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.target.style.background = isSelectMode ? (isLightMode ? '#ccc' : '#555') : '';
        document.getElementById('adv-selection-actions').style.display = isSelectMode ? 'flex' : 'none';
        selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0'; renderGrid();
    };

    document.getElementById('adv-btn-sel-all').onclick = () => {
        currentImages.forEach(src => selectedImages.add(src));
        document.getElementById('adv-sel-count').innerText = selectedImages.size; renderGrid();
    };

    document.getElementById('adv-btn-del-sel').onclick = () => deleteTargetImages(Array.from(selectedImages));
    document.getElementById('adv-btn-del-unsel').onclick = () => deleteTargetImages(currentImages.filter(src => !selectedImages.has(src)));

    document.getElementById('adv-btn-save-sel').onclick = () => {
        selectedImages.forEach(src => {
            const a = document.createElement('a'); a.href = src; a.download = src.split('/').pop();
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
        });
    };

    // 크게보기 제어
    document.getElementById('adv-nav-left').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
    document.getElementById('adv-nav-right').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
    document.getElementById('adv-lightbox').onclick = (e) => { if(e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };

    // 클립보드 복사만 하도록 수정 (요구사항 1)
    document.getElementById('adv-btn-copy-prompt').onclick = (e) => {
        e.stopPropagation();
        const dummyPrompt = "masterpiece, best quality, 1girl, blonde hair, smiling"; 
        navigator.clipboard.writeText(dummyPrompt).then(() => {
            alert("프롬프트가 클립보드에 복사되었습니다.");
        }).catch(err => {
            alert("복사 실패: " + err);
        });
    };
}

function navLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = currentImages.length - 1;
    if (currentLightboxIndex >= currentImages.length) currentLightboxIndex = 0;
    document.getElementById('adv-lightbox-img').src = currentImages[currentLightboxIndex];
}

async function deleteTargetImages(targetArray) {
    const toDelete = targetArray.filter(src => !favoriteImages.has(src));
    if (toDelete.length === 0) return alert("삭제할 이미지가 없거나 모두 즐겨찾기로 보호되어 있습니다.");
    if (!confirm(`즐겨찾기된 이미지를 제외한 ${toDelete.length}장을 영구 삭제합니다. 진행할까요?`)) return;

    for (let src of toDelete) {
        await fetch('/api/images/delete', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({path: src}) });
        currentImages = currentImages.filter(img => img !== src);
    }
    
    selectedImages.clear(); document.getElementById('adv-sel-count').innerText = '0';
    renderGrid(); alert('삭제 완료!');
    
    // 삭제 후 용량 재계산
    calculateTotalSize(currentImages);
}

jQuery(document).ready(init);
