import { getContext } from '../../../extensions.js';

let currentImages = [];
let selectedImages = new Set();
let favoriteImages = new Set(JSON.parse(localStorage.getItem('advGalleryFavs')) || []);
let isSelectMode = false;
let isLightMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

const template = `
<div id="adv-gallery-popup" style="display:none;">
    <div id="adv-gallery-controls">
        <div style="display:flex; align-items:center; gap:5px;">
            <select class="adv-ctrl-item" id="adv-char-select" title="캐릭터 선택"><option value="">👤 캐릭터 선택</option></select>
            <span id="adv-char-size" style="font-size:12px; opacity:0.6; white-space:nowrap; padding-right:10px;"></span>
        </div>
        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬">
            <option value="newest">🕒 최신순</option>
            <option value="oldest">⏳ 오래된순</option>
            <option value="size">⚖️ 파일명길이순(크기대체)</option>
        </select>
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수">
            <option value="4">🔲 4장 보기</option><option value="8" selected>🔲 8장 보기</option><option value="20">🔲 20장 보기</option>
        </select>
        <button class="adv-ctrl-item" id="adv-btn-theme" title="다크/라이트 모드 전환">🌓</button>
        <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드">✅</button>
        <button class="adv-ctrl-item" id="adv-btn-close" title="닫기" style="color:#ff4d4d;">❌</button>
    </div>
    
    <div id="adv-selection-actions" style="display:none; background: rgba(255,64,129,0.1); border-bottom: 1px solid #ff4081;">
        <button class="adv-ctrl-item" id="adv-btn-sel-all">☑️ 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel" style="color:#ff4d4d;">🗑️ 삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" style="color:orange;">⚠️ 반전삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel" style="color:#4caf50;">💾 저장</button>
    </div>

    <div id="adv-gallery-container"></div>
    
    <div id="adv-pagination" style="display:flex; justify-content:center; gap:10px; padding:10px; border-top:1px solid #444;">
        <button class="adv-ctrl-item" id="adv-btn-prev-page">◀ 이전</button>
        <span id="adv-page-info" style="align-self:center;">1/1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page">다음 ▶</button>
    </div>
</div>

<div id="adv-lightbox">
    <img id="adv-lightbox-img" src="">
    <div id="adv-lightbox-nav">
        <button class="adv-nav-btn" id="adv-nav-left">◀ 이전</button>
        <button class="adv-nav-btn" id="adv-btn-copy-prompt" style="font-weight:bold; color:yellow;">📋 프롬프트 복사</button>
        <button class="adv-nav-btn" id="adv-nav-right">다음 ▶</button>
    </div>
</div>
`;

// 메뉴 추가 함수
function addWandMenuButtons() {
    var menu = document.getElementById('extensionsMenu');
    if (!menu) return;

    if (!document.getElementById('adv-gallery-menu-btn')) {
        var btn = document.createElement('div');
        btn.id = 'adv-gallery-menu-btn';
        btn.className = 'list-group-item flex-container flexGap5';
        btn.innerHTML = '<div class="fa-solid fa-images extensionsMenuExtensionButton" style="color:#ff4081;"></div><span>고급 갤러리</span>';
        btn.addEventListener('click', function () {
            document.getElementById('adv-gallery-popup').style.display = 'flex';
            
            // 캐릭터 목록 불러오기
            const context = getContext();
            const select = document.getElementById('adv-char-select');
            select.innerHTML = '<option value="">👤 캐릭터 선택</option>';
            if (context.characters) {
                context.characters.forEach(c => {
                    select.innerHTML += `<option value="${c.avatar}">${c.name}</option>`;
                });
            }
            $('#extensionsMenu').hide(); // 메뉴 닫기
        });
        menu.appendChild(btn);
    }
}

// 용량 계산 (MB)
async function calculateTotalSize(images) {
    const sizeSpan = document.getElementById('adv-char-size');
    if (images.length === 0) { sizeSpan.innerText = '(0MB)'; return; }
    
    sizeSpan.innerText = '(용량 계산 중...)';
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
                } catch(e) {}
            }));
        }
        const mb = (totalSize / (1024 * 1024)).toFixed(2);
        sizeSpan.innerText = `(${mb}MB)`;
    } catch(e) {
        sizeSpan.innerText = '(계산 실패)';
    }
}

async function loadAndSortImages(charAvatar) {
    document.getElementById('adv-char-size').innerText = ''; 
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
    document.getElementById('adv-btn-theme').onclick = () => {
        isLightMode = !isLightMode;
        document.getElementById('adv-gallery-popup').classList.toggle('adv-light-mode', isLightMode);
    };

    document.getElementById('adv-char-select').onchange = (e) => loadAndSortImages(e.target.value);
    document.getElementById('adv-sort-select').onchange = () => loadAndSortImages(document.getElementById('adv-char-select').value);
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

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

    document.getElementById('adv-nav-left').onclick = (e) => { e.stopPropagation(); navLightbox(-1); };
    document.getElementById('adv-nav-right').onclick = (e) => { e.stopPropagation(); navLightbox(1); };
    document.getElementById('adv-lightbox').onclick = (e) => { if(e.target.id === 'adv-lightbox') e.target.style.display = 'none'; };

    // 프롬프트 클립보드 복사
    document.getElementById('adv-btn-copy-prompt').onclick = async (e) => {
        e.stopPropagation();
        const imgSrc = document.getElementById('adv-lightbox-img').src;
        try {
            const res = await fetch('/api/images/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ avatar: imgSrc.split('/').pop() }) 
            });
            let promptText = "";
            if (res.ok) {
                const metadata = await res.json();
                promptText = metadata.prompt || metadata.description || "메타데이터가 없습니다.";
            } else {
                promptText = "메타데이터를 가져오지 못했습니다.";
            }
            await navigator.clipboard.writeText(promptText);
            alert("프롬프트가 클립보드에 복사되었습니다.");
        } catch (err) {
            await navigator.clipboard.writeText("메타데이터 추출 오류 발생");
            alert("복사 오류가 발생했습니다.");
        }
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
    renderGrid(); 
    calculateTotalSize(currentImages);
    alert('삭제 완료!');
}

// ★ 초기화 로직
jQuery(async function () {
    document.body.insertAdjacentHTML('beforeend', template);
    addWandMenuButtons();
    bindEvents();
});
