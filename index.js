import { getContext } from '../../../extensions.js';

let currentImages = []; 
let selectedImages = new Set();
let favoriteImages = new Set(JSON.parse(localStorage.getItem('advGalleryFavs')) || []);
let isSelectMode = false;
let currentPage = 1, itemsPerPage = 8, currentLightboxIndex = 0;

// 캐릭터 선택을 빼고 '현재 채팅' 전용으로 UI 간소화
const template = `
<div id="adv-gallery-popup" style="display:none; position:fixed; top:5vh; left:5vw; width:90vw; height:90vh; min-width:320px; min-height:400px; resize:both; overflow:hidden; background:var(--SmartThemeBlurTintColor, #1a1a1a); backdrop-filter:blur(10px); border:1px solid var(--SmartThemeBorderColor, #444); border-radius:12px; z-index:9999; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    
    <div id="adv-gallery-controls" style="display:flex; align-items:center; gap:8px; padding:10px; border-bottom:1px solid var(--SmartThemeBorderColor, #444); background:rgba(0,0,0,0.2); overflow-x:auto; flex-shrink:0; white-space:nowrap;">
        
        <div style="font-weight:bold; color:var(--SmartThemeBodyColor); padding:5px 10px; background:rgba(255,255,255,0.05); border-radius:5px;">
            💬 현재 채팅 갤러리
        </div>
        
        <select class="adv-ctrl-item" id="adv-sort-select" title="정렬" style="padding:5px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555; cursor:pointer;">
            <option value="newest">🕒 최신순</option>
            <option value="oldest">⏳ 오래된순</option>
        </select>
        
        <select class="adv-ctrl-item" id="adv-grid-select" title="화면 표시 장수" style="padding:5px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555; cursor:pointer;">
            <option value="4">🔲 4장 보기</option><option value="8" selected>🔲 8장 보기</option><option value="20">🔲 20장 보기</option>
        </select>
        
        <div style="margin-left:auto; display:flex; gap:8px;">
            <button class="adv-ctrl-item" id="adv-btn-select" title="다중 선택 모드" style="width:32px; height:32px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:1px solid #555; cursor:pointer;"><i class="fa-solid fa-check-double"></i></button>
            <button class="adv-ctrl-item" id="adv-btn-close" title="닫기" style="width:32px; height:32px; border-radius:5px; background:rgba(255,77,77,0.2); color:#ff4d4d; border:1px solid rgba(255,77,77,0.5); cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
        </div>
    </div>

    <div id="adv-selection-actions" style="display:none; padding:8px 10px; gap:10px; align-items:center; background:rgba(255,64,129,0.15); border-bottom:1px solid #ff4081; flex-shrink:0; overflow-x:auto; white-space:nowrap;">
        <button class="adv-ctrl-item" id="adv-btn-sel-all" style="padding:5px 10px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-check-square"></i> 전체선택</button>
        <button class="adv-ctrl-item" id="adv-btn-del-sel" style="padding:5px 10px; border-radius:5px; background:rgba(255,77,77,0.2); color:#ff4d4d; border:none; cursor:pointer; font-weight:bold;"><i class="fa-solid fa-trash"></i> 삭제(<span id="adv-sel-count">0</span>)</button>
        <button class="adv-ctrl-item" id="adv-btn-del-unsel" style="padding:5px 10px; border-radius:5px; background:rgba(255,165,0,0.2); color:orange; border:none; cursor:pointer;"><i class="fa-solid fa-triangle-exclamation"></i> 제외삭제</button>
        <button class="adv-ctrl-item" id="adv-btn-save-sel" style="padding:5px 10px; border-radius:5px; background:rgba(76,175,80,0.2); color:#4caf50; border:none; cursor:pointer;"><i class="fa-solid fa-download"></i> 저장</button>
    </div>

    <div id="adv-gallery-container" style="flex-grow:1; overflow-y:auto; padding:15px; display:grid; gap:10px; grid-template-columns:repeat(var(--columns, 4), 1fr); align-content:start;"></div>

    <div id="adv-pagination" style="display:flex; justify-content:center; gap:15px; padding:10px; border-top:1px solid var(--SmartThemeBorderColor, #444); background:rgba(0,0,0,0.2); flex-shrink:0;">
        <button class="adv-ctrl-item" id="adv-btn-prev-page" style="width:36px; height:30px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-chevron-left"></i></button>
        <span id="adv-page-info" style="align-self:center; font-size:13px; opacity:0.8;">1 / 1</span>
        <button class="adv-ctrl-item" id="adv-btn-next-page" style="width:36px; height:30px; border-radius:5px; background:rgba(255,255,255,0.1); color:inherit; border:none; cursor:pointer;"><i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>

<div id="adv-lightbox" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.9); z-index:10000; flex-direction:column; justify-content:center; align-items:center;">
    <img id="adv-lightbox-img" src="" style="max-width:90vw; max-height:80vh; object-fit:contain; border-radius:8px;">
    <div id="adv-lightbox-nav" style="position:absolute; bottom:20px; display:flex; gap:15px;">
        <button class="adv-nav-btn" id="adv-nav-left" style="padding:10px 15px; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:8px; cursor:pointer; backdrop-filter:blur(5px);"><i class="fa-solid fa-chevron-left"></i> 이전</button>
        <button class="adv-nav-btn" id="adv-btn-copy-prompt" style="padding:10px 15px; background:rgba(255,213,79,0.2); color:#ffd54f; font-weight:bold; border:1px solid rgba(255,213,79,0.5); border-radius:8px; cursor:pointer;"><i class="fa-solid fa-clipboard"></i> 프롬프트 복사</button>
        <button class="adv-nav-btn" id="adv-nav-right" style="padding:10px 15px; background:rgba(255,255,255,0.1); color:white; border:none; border-radius:8px; cursor:pointer; backdrop-filter:blur(5px);">다음 <i class="fa-solid fa-chevron-right"></i></button>
    </div>
</div>
`;

// 1. 메뉴 버튼 추가 (안전하게 UI 렌더링 후 삽입)
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
                    // 갤러리 열 때마다 현재 채팅창 이미지를 로드
                    loadCurrentChatImages();
                    document.getElementById('extensionsMenuButton')?.click();
                });
                menu.appendChild(btn);
            }
            clearInterval(initInterval);
        }
    }, 500);
}

// 2. ★ 원본 방식: 서버 폴더 대신 "현재 열려있는 채팅 기록"에서만 이미지를 즉시 추출 (렉 0%)
function loadCurrentChatImages() {
    const container = document.getElementById('adv-gallery-container');
    const context = getContext();
    
    // 현재 채팅 데이터가 없으면 종료
    if (!context.chat || context.chat.length === 0) {
        currentImages = [];
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">현재 채팅에 이미지가 없습니다.</p>';
        return;
    }

    let foundImages = new Set();
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;

    // 현재 채팅 배열을 훑으며 이미지 태그와 생성된 이미지(extra) 추출
    context.chat.forEach(msg => {
        // SD 등으로 생성되어 첨부된 이미지
        if (msg.extra && msg.extra.image) {
            foundImages.add(msg.extra.image);
        }
        // 본문(mes) 안에 포함된 이미지 태그
        if (msg.mes) {
            let match;
            while ((match = imgRegex.exec(msg.mes)) !== null) {
                // base64로 인코딩된 이모티콘 등은 제외하고 실제 파일 경로만 수집
                if (!match[1].startsWith('data:')) {
                    foundImages.add(match[1]);
                }
            }
        }
    });

    currentImages = Array.from(foundImages);

    if (currentImages.length === 0) {
        container.innerHTML = '<p style="text-align:center; padding-top:40px; color:#aaa; grid-column:1/-1;">현재 채팅에 이미지가 없습니다.</p>';
        return;
    }

    applySortAndRender();
}

// 3. 정렬 및 화면 그리기
function applySortAndRender() {
    const sortType = document.getElementById('adv-sort-select').value;
    
    // 채팅 기록은 위에서 아래로 읽히므로 기본이 '오래된 순'입니다.
    if (sortType === 'newest') {
        currentImages.reverse();
    }
    // size 정렬은 현재 채팅에선 굳이 필요 없으므로 제거했습니다.

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
        card.style.cssText = `position:relative; aspect-ratio:1/1; border-radius:10px; overflow:hidden; background:rgba(0,0,0,0.3); cursor:pointer; transition:transform 0.1s; border: 2px solid ${selectedImages.has(src) ? '#ff4081' : 'transparent'};`;
        card.onmouseover = () => card.style.transform = 'scale(1.03)';
        card.onmouseout = () => card.style.transform = 'scale(1)';

        const favBtn = document.createElement('button');
        favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
        favBtn.style.cssText = `position:absolute; top:5px; left:5px; width:28px; height:28px; background:rgba(0,0,0,0.5); border:none; border-radius:50%; color:${favoriteImages.has(src) ? '#ffd54f' : 'white'}; cursor:pointer; z-index:10; font-size:12px;`;
        
        favBtn.onclick = (e) => {
            e.stopPropagation();
            if (favoriteImages.has(src)) favoriteImages.delete(src); else favoriteImages.add(src);
            localStorage.setItem('advGalleryFavs', JSON.stringify([...favoriteImages]));
            favBtn.innerHTML = favoriteImages.has(src) ? '<i class="fa-solid fa-star"></i>' : '<i class="fa-regular fa-star"></i>';
            favBtn.style.color = favoriteImages.has(src) ? '#ffd54f' : 'white';
        };

        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = "width:100%; height:100%; object-fit:cover;";
        
        card.appendChild(favBtn);
        card.appendChild(img);

        if(selectedImages.has(src)) {
            const check = document.createElement('div');
            check.innerHTML = '<i class="fa-solid fa-check"></i>';
            check.style.cssText = 'position:absolute; top:5px; right:5px; width:24px; height:24px; background:#ff4081; color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px;';
            card.appendChild(check);
        }

        card.onclick = () => {
            if (isSelectMode) {
                if (selectedImages.has(src)) selectedImages.delete(src); else selectedImages.add(src);
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

// 4. 이벤트 바인딩
function bindEvents() {
    document.getElementById('adv-btn-close').onclick = () => {
        document.getElementById('adv-gallery-popup').style.display = 'none';
        isSelectMode = false;
        document.getElementById('adv-btn-select').style.background = 'rgba(255,255,255,0.1)';
        document.getElementById('adv-selection-actions').style.display = 'none';
    };

    document.getElementById('adv-sort-select').onchange = () => {
        if(currentImages.length > 0) applySortAndRender();
    };
    
    document.getElementById('adv-grid-select').onchange = (e) => { itemsPerPage = parseInt(e.target.value); renderGrid(); };

    document.getElementById('adv-btn-prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
    document.getElementById('adv-btn-next-page').onclick = () => { if(currentPage < Math.ceil(currentImages.length/itemsPerPage)) { currentPage++; renderGrid(); } };

    document.getElementById('adv-btn-select').onclick = (e) => {
        isSelectMode = !isSelectMode;
        e.currentTarget.style.background = isSelectMode ? 'rgba(255,64,129,0.5)' : 'rgba(255,255,255,0.1)';
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
        if(selectedImages.size === 0) return alert('저장할 이미지가 없습니다.');
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

    // 프롬프트 복사
    document.getElementById('adv-btn-copy-prompt').onclick = async (e) => {
        e.stopPropagation();
        const imgSrc = document.getElementById('adv-lightbox-img').src;
        try {
            const headers = typeof window.getRequestHeaders === 'function' ? window.getRequestHeaders() : { 'Content-Type': 'application/json', 'X-CSRF-Token': getContext().csrf_token };
            const res = await fetch('/api/images/extract', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({ avatar: imgSrc.split('/').pop() })
            });
            
            if (res.ok) {
                const metadata = await res.json();
                const promptText = metadata.prompt || metadata.description || "프롬프트 데이터가 없습니다.";
                await navigator.clipboard.writeText(promptText);
                alert("클립보드에 복사되었습니다.");
            } else {
                alert("메타데이터를 가져오지 못했습니다.");
            }
        } catch (err) {
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
    if (toDelete.length === 0) return alert("삭제할 이미지가 없거나 모두 ⭐ 즐겨찾기로 보호되어 있습니다.");

    if (!confirm(`즐겨찾기된 이미지를 제외한 ${toDelete.length}장을 서버에서 영구 삭제합니다. 진행할까요?`)) return;

    const headers = typeof window.getRequestHeaders === 'function' 
        ? window.getRequestHeaders() 
        : { 'Content-Type': 'application/json', 'X-CSRF-Token': getContext().csrf_token };

    for (let src of toDelete) {
        try {
            await fetch('/api/images/delete', { 
                method: 'POST', 
                headers: headers, 
                body: JSON.stringify({ path: src }) 
            });
            currentImages = currentImages.filter(img => img !== src);
        } catch(e) { console.error(e); }
    }
    
    selectedImages.clear(); 
    document.getElementById('adv-sel-count').innerText = '0';
    renderGrid();
    alert('서버에서 삭제 완료되었습니다.\n(※ 이미지는 서버에서 지워졌으나, 대화 내역의 빈 액박을 없애려면 채팅창을 새로고침 하거나 해당 메시지를 수정해야 합니다.)');
}

jQuery(function () {
    document.body.insertAdjacentHTML('beforeend', template);
    addWandMenuButtons();
    bindEvents();
});
