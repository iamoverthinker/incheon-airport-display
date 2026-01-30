// 전역 변수
let flightData = {
    arrivals: [],
    departures: []
};

// [핵심 변경] 출발/도착 페이지 인덱스를 따로 관리 (독립 페이징)
let pageIndex = {
    arrivals: 0,
    departures: 0
};

let airportTranslations = {};

const ROTATION_INTERVAL = 10000; // 10초마다 페이지 전환
const API_INTERVAL = 180000;     // 3분마다 데이터 갱신

// 화면 크기에 따라 최적 행 수 계산 (유연 + 안정)
function getRowsPerPage() {
    const screenHeight = window.innerHeight;
    const screenWidth = window.innerWidth;
    
    // 모바일 감지
    if (screenWidth < 768) return 4;
    
    // 화면 높이 기반 계산
    const headerHeight = 250; // 헤더 + 여백
    const rowHeight = Math.max(60, screenHeight * 0.06); // 화면 높이의 6%
    const availableHeight = screenHeight - headerHeight;
    const calculatedRows = Math.floor(availableHeight / rowHeight);
    
    // 안정성을 위한 단계별 제한
    if (screenHeight >= 2160) return Math.min(calculatedRows, 14); // 4K: 최대 14개
    if (screenHeight >= 1440) return Math.min(calculatedRows, 10); // 2K: 최대 10개
    if (screenHeight >= 1080) return Math.min(calculatedRows, 8);  // FHD: 최대 8개
    if (screenHeight >= 900) return Math.min(calculatedRows, 6);   // HD+: 최대 6개
    
    return Math.max(calculatedRows, 4); // 최소 4개 보장
}

// 현재 화면에 맞는 행 수
let ROWS_PER_PAGE = getRowsPerPage();

console.log(`Screen: ${window.innerWidth}x${window.innerHeight}, Rows per page: ${ROWS_PER_PAGE}`);

// 공항 데이터 로드 함수
async function loadAirportData() {
    try {
        const response = await fetch('airports.json');
        airportTranslations = await response.json();
        console.log('Airport data loaded:', Object.keys(airportTranslations).length, 'airports');
    } catch (error) {
        console.error('Failed to load airport data:', error);
    }
}

// 공항명 영어 변환
function translateAirport(airportKr) {
    if (airportTranslations[airportKr]) {
        return airportTranslations[airportKr];
    }
    
    // 괄호 제거 후 재검색 (예: "다낭(다낭)" -> "다낭")
    const cleanName = airportKr.replace(/\(.*\)/, '').trim();
    if (airportTranslations[cleanName]) {
        return airportTranslations[cleanName];
    }

    // 없으면 대문자로 변환 (영어는 그대로, 한글은 눈에 띄게)
    const result = airportKr.toUpperCase();
    
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(result)) {
        console.warn(`⚠️ Missing airport in JSON: ${airportKr}`);
    }
    
    return result;
}

// 상태 영어 변환
function translateStatus(statusKr) {
    const translations = {
        '도착': 'ARRIVED',
        '출발': 'DEPARTED',
        '지연': 'DELAYED',
        '결항': 'CANCELLED',
        '취소': 'CANCELLED',
        '탑승중': 'BOARDING',
        '탑승준비': 'GATE OPEN',
        '마감': 'CLOSED',
        '예정': 'SCHEDULED',
        '탑승구변경': 'GATE CHNG',
        '수하물': 'BAGGAGE',
        '체크인': 'CHECK-IN',
        '이륙': 'TAKE OFF'
    };
    
    for (const [kr, en] of Object.entries(translations)) {
        if (statusKr.includes(kr)) {
            return en;
        }
    }
    
    return statusKr.toUpperCase();
}

// [핵심 변경] 상태 색상 클래스 기준 개선
function getStatusClass(status) {
    // 1. 빨강 (심각): 결항, 취소, 회항
    if (status.includes('결항') || status.includes('취소') || status.includes('회항')) return 'status-red';
    
    // 2. 오렌지/노랑 (주의, 진행중): 지연, 탑승구변경, 마감, 탑승중
    if (status.includes('지연') || status.includes('탑승구변경')) return 'status-orange';
    if (status.includes('탑승중') || status.includes('마감')) return 'status-orange'; 

    // 3. 초록 (완료/정상): 출발, 도착, 이륙
    if (status.includes('도착') || status.includes('출발') || status.includes('이륙')) return 'status-green';

    // 4. 나머지(예정, 체크인 등)는 기본값(흰색)
    return ''; 
}

// 스플릿 플랩 텍스트 생성
function createFlapText(text, maxLength = 19) {
    if (!text) text = '-';
    const padded = text.toString().toUpperCase().padEnd(maxLength, ' ');
    const chars = padded.split('');
    
    return chars.map(char => {
        return `<span class="flap-char">${char === ' ' ? '&nbsp;' : char}</span>`;
    }).join('');
}

// 시간 포맷팅
function formatTime(dateTime) {
    if (!dateTime || dateTime.length < 12) return '--:--';
    return `${dateTime.slice(8, 10)}:${dateTime.slice(10, 12)}`;
}

// 시간 범위 필터링 함수
function filterFlightsByTimeRange(flights, type) {
    const now = new Date();
    
    let minTime, maxTime;
    
    if (type === 'arrival') {
        minTime = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        maxTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    } else {
        minTime = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        maxTime = new Date(now.getTime() + 6 * 60 * 60 * 1000);
    }
    
    const validFlights = flights.filter(f => {
        const t = f.scheduleDatetime || f.estimatedDatetime;
        return t && t.length >= 12;
    });

    const filtered = validFlights.filter(flight => {
        const timeStr = flight.scheduleDatetime || flight.estimatedDatetime;
        
        const year = parseInt(timeStr.substring(0, 4), 10);
        const month = parseInt(timeStr.substring(4, 6), 10) - 1;
        const day = parseInt(timeStr.substring(6, 8), 10);
        const hour = parseInt(timeStr.substring(8, 10), 10);
        const minute = parseInt(timeStr.substring(10, 12), 10);
        
        const flightTime = new Date(year, month, day, hour, minute);
        
        return flightTime >= minTime && flightTime <= maxTime;
    });

    filtered.sort((a, b) => {
        const timeA = a.scheduleDatetime || a.estimatedDatetime;
        const timeB = b.scheduleDatetime || b.estimatedDatetime;
        return timeA.localeCompare(timeB);
    });
    
    console.log(`[${type}] Filtered: ${filtered.length} / Total: ${flights.length}`);
    
    return filtered;
}

// 3일치 데이터 한 번에 가져오기
async function fetchAllFlightData() {
    const dates = [-1, 0, 1].map(offset => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}${month}${day}`;
    });

    console.log(`Fetching flight data for dates: ${dates.join(', ')}`);

    const promises = [];
    const types = ['departure', 'arrival'];

    const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const baseUrl = isDev ? 'http://localhost:3000' : '';

    dates.forEach(date => {
        types.forEach(type => {
            const url = `${baseUrl}/api/flights?type=${type}&date=${date}&_t=${Date.now()}`;
            
            promises.push(
                fetch(url)
                    .then(res => {
                        if (!res.ok) throw new Error(`Status ${res.status}`);
                        return res.text();
                    })
                    .then(text => {
                        const parser = new DOMParser();
                        const xml = parser.parseFromString(text, 'text/xml');
                        const errorMsg = xml.querySelector('returnAuthMsg');
                        if (errorMsg) return { type, data: [] }; // 에러 시 빈 배열
                        
                        const items = xml.querySelectorAll('item');
                        const parsedList = [];

                        items.forEach(item => {
                            const flightId = item.querySelector('flightId')?.textContent || '-';
                            const airportKr = item.querySelector('airport')?.textContent || '-';
                            const scheduleDatetime = item.querySelector('scheduleDatetime')?.textContent || '';
                            const estimatedDatetime = item.querySelector('estimatedDatetime')?.textContent || '';
                            const remarkKr = item.querySelector('remark')?.textContent || '-';
                            
                            const timeValue = scheduleDatetime || estimatedDatetime;
                            
                            parsedList.push({
                                flightId,
                                airport: translateAirport(airportKr),
                                time: formatTime(timeValue),
                                status: translateStatus(remarkKr),
                                statusClass: getStatusClass(remarkKr),
                                scheduleDatetime,
                                estimatedDatetime
                            });
                        });
                        return { type, data: parsedList };
                    })
                    .catch(err => {
                        console.warn(`Failed to fetch ${type} on ${date}:`, err);
                        return { type, data: [] }; 
                    })
            );
        });
    });

    try {
        const results = await Promise.all(promises);
        let allDepartures = [];
        let allArrivals = [];

        results.forEach(result => {
            if (result.type === 'departure') {
                allDepartures = allDepartures.concat(result.data);
            } else {
                allArrivals = allArrivals.concat(result.data);
            }
        });

        flightData.departures = filterFlightsByTimeRange(allDepartures, 'departure');
        flightData.arrivals = filterFlightsByTimeRange(allArrivals, 'arrival');

        // Fallback: 필터 결과가 0개면 원본 데이터 일부 사용
        if (flightData.departures.length === 0 && allDepartures.length > 0) {
            flightData.departures = allDepartures.slice(0, 20);
        }
        if (flightData.arrivals.length === 0 && allArrivals.length > 0) {
            flightData.arrivals = allArrivals.slice(0, 20);
        }

        console.log(`Updated Data - Dep: ${flightData.departures.length}, Arr: ${flightData.arrivals.length}`);

        // 데이터 갱신 시 페이지 인덱스 초기화
        pageIndex.arrivals = 0;
        pageIndex.departures = 0;
        
        displayCurrentPage();

    } catch (error) {
        console.error('Critical Error in fetchAllFlightData:', error);
    }
}

// [핵심 변경] 독립 페이징 적용된 displayCurrentPage
function displayCurrentPage() {
    displaySection('arrivals');
    displaySection('departures');
}

function displaySection(type) {
    const listData = flightData[type];
    const currentIndex = pageIndex[type]; // 각 타입별 페이지 인덱스 사용
    
    // 데이터가 없으면 빈 리스트 표시
    if (listData.length === 0) {
        fillEmptyRows([], ROWS_PER_PAGE);
        displayFlights(type, []);
        return;
    }

    // 전체 페이지 수 계산
    const totalPages = Math.ceil(listData.length / ROWS_PER_PAGE);
    
    // 안전한 페이지 인덱스 계산
    const safePage = currentIndex % (totalPages || 1);
    
    const startIdx = safePage * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    
    const currentFlights = listData.slice(startIdx, endIdx);
    
    // 빈 줄 채우기
    fillEmptyRows(currentFlights, ROWS_PER_PAGE);
    
    displayFlights(type, currentFlights);
}

// 빈 행 채우기
function fillEmptyRows(list, targetCount) {
    while (list.length < targetCount) {
        list.push({
            flightId: '',
            airport: '',
            time: '',
            status: '',
            statusClass: ''
        });
    }
}

// 비행 정보 화면 렌더링
function displayFlights(type, flights) {
    const listId = type === 'arrivals' ? 'arrivals-list' : 'departures-list';
    const list = document.getElementById(listId);
    
    // 기존 내용이 없으면(첫 로드) 바로 그림
    if (!list.innerHTML.trim()) {
        renderList(list, flights, type);
    } else {
        // 이미 있으면 애니메이션 업데이트
        animateFlightDataChange(type, flights);
    }
}

// 리스트 HTML 생성
function renderList(container, flights, type) {
    container.innerHTML = '';
    flights.forEach((flight, index) => {
        const row = document.createElement('div');
        row.className = 'flight-row';
        row.innerHTML = `
            <div class="flight-cell">
                <strong>FLIGHT</strong>
                <div class="flap-container">${createFlapText(flight.flightId, 7)}</div>
            </div>
            <div class="flight-cell">
                <strong>${type === 'arrivals' ? 'FROM' : 'TO'}</strong>
                <div class="flap-container">${createFlapText(flight.airport, 19)}</div>
            </div>
            <div class="flight-cell">
                <strong>TIME</strong>
                <div class="flap-container">${createFlapText(flight.time, 5)}</div>
            </div>
            <div class="flight-cell">
                <strong>STATUS</strong>
                <div class="flap-container ${flight.statusClass}">${createFlapText(flight.status, 9)}</div>
            </div>
        `;
        container.appendChild(row);
    });
}

// [핵심 변경] 독립 로테이션 로직
function rotatePage() {
    // 1. 도착편 페이지 넘기기
    const arrivalPages = Math.ceil(flightData.arrivals.length / ROWS_PER_PAGE);
    if (arrivalPages > 1) {
        pageIndex.arrivals = (pageIndex.arrivals + 1) % arrivalPages;
    }

    // 2. 출발편 페이지 넘기기 (도착편과 별개로 동작)
    const departurePages = Math.ceil(flightData.departures.length / ROWS_PER_PAGE);
    if (departurePages > 1) {
        pageIndex.departures = (pageIndex.departures + 1) % departurePages;
    }
    
    displayCurrentPage();
}

// 스플릿 플랩 문자 변경 애니메이션
function animateFlightDataChange(type, newFlights) {
    const listId = type === 'arrivals' ? 'arrivals-list' : 'departures-list';
    const rows = document.querySelectorAll(`#${listId} .flight-row`);
    
    rows.forEach((row, rowIndex) => {
        if (rowIndex >= newFlights.length) return;
        
        const flight = newFlights[rowIndex];
        const cells = row.querySelectorAll('.flight-cell .flap-container');
        
        const fId = flight.flightId || '';
        const fAir = flight.airport || '';
        const fTime = flight.time || '';
        const fStat = flight.status || '';

        const newTexts = [
            fId.padEnd(7, ' '),
            fAir.padEnd(19, ' '),
            fTime.padEnd(5, ' '),
            fStat.padEnd(9, ' ')
        ];
        
        // 상태 색상 업데이트
        const statusContainer = cells[3];
        statusContainer.className = `flap-container ${flight.statusClass || ''}`;
        
        cells.forEach((cell, cellIndex) => {
            const chars = cell.querySelectorAll('.flap-char');
            const newText = newTexts[cellIndex];
            
            if (chars.length !== newText.length) {
                cell.innerHTML = createFlapText(newText.trim(), newText.length);
                return;
            }

            chars.forEach((charElement, charIndex) => {
                const currentChar = charElement.textContent === '\u00A0' ? ' ' : charElement.textContent;
                const targetChar = newText[charIndex];
                
                if (currentChar !== targetChar) {
                    const delay = rowIndex * 50 + cellIndex * 20 + charIndex * 10;
                    animateSingleChar(charElement, currentChar, targetChar, delay);
                }
            });
        });
    });
}

// 단일 문자 애니메이션
function animateSingleChar(element, fromChar, toChar, delay) {
    const chars = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-:./';
    
    setTimeout(() => {
        let currentIndex = chars.indexOf(fromChar);
        if (currentIndex === -1) currentIndex = 0;
        
        const targetIndex = chars.indexOf(toChar);
        if (targetIndex === -1) {
            element.textContent = toChar === ' ' ? '\u00A0' : toChar;
            return;
        }
        
        let distance = targetIndex - currentIndex;
        if (distance < 0) distance += chars.length;
        
        const steps = Math.min(distance, 5 + Math.floor(Math.random() * 5));
        
        let step = 0;
        const interval = setInterval(() => {
            if (step >= steps) {
                clearInterval(interval);
                element.textContent = toChar === ' ' ? '\u00A0' : toChar;
                element.classList.remove('flipping');
                return;
            }
            
            element.classList.add('flipping');
            currentIndex = (currentIndex + 1) % chars.length;
            const currentChar = chars[currentIndex];
            element.textContent = currentChar === ' ' ? '\u00A0' : currentChar;
            step++;
        }, 60);
        
    }, delay);
}


// [초기 실행]
loadAirportData().then(() => {
    fetchAllFlightData(); // 3일치 데이터 로드 시작
});

// 주기적 실행
setInterval(rotatePage, ROTATION_INTERVAL);
setInterval(fetchAllFlightData, API_INTERVAL);

// 화면 리사이즈 처리
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const newRowsPerPage = getRowsPerPage();
        if (newRowsPerPage !== ROWS_PER_PAGE) {
            console.log(`Rows updated: ${ROWS_PER_PAGE} → ${newRowsPerPage}`);
            ROWS_PER_PAGE = newRowsPerPage;
            
            document.getElementById('arrivals-list').innerHTML = '';
            document.getElementById('departures-list').innerHTML = '';
            
            // 리사이즈 시 페이지 초기화
            pageIndex = { arrivals: 0, departures: 0 };
            displayCurrentPage();
        }
    }, 500);
});
