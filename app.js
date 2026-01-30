// 전역 변수 (맨 위에 한 번만 선언)
let currentPage = 0;
let arrivalsData = [];
let departuresData = [];
let airportTranslations = {};


const ROTATION_INTERVAL = 10000; // 10초
const API_INTERVAL = 180000; // 3분



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


// 공항명 영어 변환 (프로덕션)
function translateAirport(airportKr) {
    // JSON에 있으면 반환
    if (airportTranslations[airportKr]) {
        return airportTranslations[airportKr];
    }
    
    // 없으면 대문자로 변환 (영어는 그대로, 한글은 눈에 띄게)
    const result = airportKr.toUpperCase();
    
    // 한글이 포함되어 있으면 경고
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
        '탑승중': 'BOARDING',
        '예정': 'SCHEDULED'
    };
    
    for (const [kr, en] of Object.entries(translations)) {
        if (statusKr.includes(kr)) {
            return en;
        }
    }
    return statusKr.toUpperCase();
}


// 스플릿 플랩 텍스트 생성
function createFlapText(text, maxLength = 19) {
    if (!text) text = '-';
    const padded = text.toString().toUpperCase().padEnd(maxLength, ' ');
    const chars = padded.split('');
    
    return chars.map(char => {
        // 공백도 동일하게 flap-char로 처리 (빈 칸 유지)
        return `<span class="flap-char">${char === ' ' ? '&nbsp;' : char}</span>`;
    }).join('');
}


// 시간 범위 필터링 함수 (도착/출발 구분)
function filterFlightsByTimeRange(flights, type) {
    const now = new Date();
    
    // 타입에 따라 다른 시간 범위 적용
    let minTime, maxTime;
    
    if (type === 'arrival') {
        // 도착편: 2시간 전 ~ 1시간 후
        minTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        maxTime = new Date(now.getTime() + 1 * 60 * 60 * 1000);
    } else {
        // 출발편: 1시간 전 ~ 4시간 후
        minTime = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        maxTime = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    }
    
    const typeLabel = type === 'arrival' ? 'Arrivals' : 'Departures';
    console.log(`${typeLabel} filter range: ${minTime.toLocaleTimeString('ko-KR')} ~ ${maxTime.toLocaleTimeString('ko-KR')}`);
    
    return flights.filter(flight => {
        try {
            const timeStr = flight.scheduleDatetime || flight.estimatedDatetime;
            
            if (!timeStr || timeStr.length < 12) {
                console.warn(`Invalid time format for flight ${flight.flightId}:`, timeStr);
                return false;
            }
            
            const year = parseInt(timeStr.substring(0, 4), 10);
            const month = parseInt(timeStr.substring(4, 6), 10) - 1;
            const day = parseInt(timeStr.substring(6, 8), 10);
            const hour = parseInt(timeStr.substring(8, 10), 10);
            const minute = parseInt(timeStr.substring(10, 12), 10);
            
            if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
                console.warn(`Failed to parse time for flight ${flight.flightId}:`, timeStr);
                return false;
            }
            
            const flightTime = new Date(year, month, day, hour, minute);
            
            if (isNaN(flightTime.getTime())) {
                console.warn(`Invalid date created for flight ${flight.flightId}:`, timeStr);
                return false;
            }
            
            return flightTime >= minTime && flightTime <= maxTime;
            
        } catch (error) {
            console.error(`Error filtering flight ${flight.flightId}:`, error);
            return false;
        }
    });
}


// API 호출
async function fetchFlightData(type) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const operation = type === 'arrival' 
        ? '/getFltArrivalsDeOdp'
        : '/getFltDeparturesDeOdp';
    
    const apiUrl = 'https://apis.data.go.kr/B551177/statusOfAllFltDeOdp' + operation;
    const targetUrl = `${apiUrl}?serviceKey=${CONFIG.API_KEY}&schDate=${dateStr}&numOfRows=100&pageNo=1`;
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);

    try {
        const response = await fetch(proxyUrl);
        const text = await response.text();
        
        const parser = new DOMParser();
        const xml = parser.parseFromString(text, 'text/xml');
        
        const errorMsg = xml.querySelector('returnAuthMsg');
        if (errorMsg) {
            throw new Error(`API Error: ${errorMsg.textContent}`);
        }
        
        const items = xml.querySelectorAll('item');
        const flightData = [];

        items.forEach((item, index) => {
            const flightId = item.querySelector('flightId')?.textContent || '-';
            const airportKr = item.querySelector('airport')?.textContent || '-';
            const scheduleDatetime = item.querySelector('scheduleDatetime')?.textContent || '';
            const estimatedDatetime = item.querySelector('estimatedDatetime')?.textContent || '';
            const remarkKr = item.querySelector('remark')?.textContent || '-';
            
            if (index === 0) {
                console.log('=== Debug First Flight ===');
                console.log('Flight ID:', flightId);
                console.log('scheduleDatetime:', scheduleDatetime);
                console.log('estimatedDatetime:', estimatedDatetime);
            }
            
            const timeValue = scheduleDatetime || estimatedDatetime;
            
            flightData.push({
                flightId,
                airport: translateAirport(airportKr),
                time: formatTime(timeValue),
                status: translateStatus(remarkKr),
                statusClass: getStatusClass(remarkKr),
                scheduleDatetime,
                estimatedDatetime
            });
        });
        
        // 시간 범위 필터링 적용
        const filteredData = filterFlightsByTimeRange(flightData, type);
        
        // 필터링 결과가 0개면 전체 데이터 사용 (테스트 데이터 대응)
        const finalData = filteredData.length > 0 ? filteredData : flightData;
        
        console.log(`${type === 'arrival' ? 'Arrivals' : 'Departures'} - Total: ${flightData.length}, Filtered: ${filteredData.length}, Using: ${finalData.length}`);
        
        return finalData;

    } catch (error) {
        console.error('API Failed:', error);
        return [];
    }
}



// 양쪽 API 모두 호출
async function fetchAllData() {
    const [arrivals, departures] = await Promise.all([
        fetchFlightData('arrival'),
        fetchFlightData('departure')
    ]);
    
    arrivalsData = arrivals;
    departuresData = departures;
    currentPage = 0;
    displayCurrentPage();
}


// 현재 페이지 표시
function displayCurrentPage() {
    const startIdx = currentPage * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    
    displayFlights('arrivals', arrivalsData.slice(startIdx, endIdx));
    displayFlights('departures', departuresData.slice(startIdx, endIdx));
}


// 비행 정보 표시 (고정 칸 수)
function displayFlights(type, flights) {
    const listId = type === 'arrivals' ? 'arrivals-list' : 'departures-list';
    const list = document.getElementById(listId);
    list.innerHTML = '';
    
    if (flights.length === 0) {
        list.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">No data available</p>';
        return;
    }
    
    flights.forEach((flight, index) => {
        const row = document.createElement('div');
        row.className = 'flight-row';
        row.style.animationDelay = `${index * 0.05}s`;
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
        list.appendChild(row);
    });
}



function formatTime(dateTime) {
    if (!dateTime || dateTime.length < 12) return '--:--';
    return `${dateTime.slice(8, 10)}:${dateTime.slice(10, 12)}`;
}


function getStatusClass(status) {
    if (status.includes('출발') || status.includes('도착')) return 'status-green';
    if (status.includes('지연')) return 'status-orange';
    if (status.includes('결항')) return 'status-red';
    return '';
}


// 페이지 로테이션 (애니메이션 적용)
function rotatePage() {
    const maxPages = Math.max(
        Math.ceil(arrivalsData.length / ROWS_PER_PAGE),
        Math.ceil(departuresData.length / ROWS_PER_PAGE)
    );
    
    if (maxPages === 0) return;
    
    currentPage = (currentPage + 1) % maxPages;
    
    // 애니메이션과 함께 페이지 전환
    const startIdx = currentPage * ROWS_PER_PAGE;
    const endIdx = startIdx + ROWS_PER_PAGE;
    
    const currentArrivals = arrivalsData.slice(startIdx, endIdx);
    const currentDepartures = departuresData.slice(startIdx, endIdx);
    
    // 기존 DOM이 있으면 애니메이션 적용
    const arrivalsList = document.getElementById('arrivals-list');
    const departuresList = document.getElementById('departures-list');
    
    if (arrivalsList.children.length > 0) {
        animateFlightDataChange('arrivals', currentArrivals);
        animateFlightDataChange('departures', currentDepartures);
    } else {
        // 최초 로드시에만 바로 표시
        displayFlights('arrivals', currentArrivals);
        displayFlights('departures', currentDepartures);
    }
}


// 스플릿 플랩 문자 변경 애니메이션
function animateFlightDataChange(type, newFlights) {
    const listId = type === 'arrivals' ? 'arrivals-list' : 'departures-list';
    const rows = document.querySelectorAll(`#${listId} .flight-row`);
    
    rows.forEach((row, rowIndex) => {
        if (rowIndex >= newFlights.length) return;
        
        const flight = newFlights[rowIndex];
        const cells = row.querySelectorAll('.flight-cell .flap-container');
        
        const newTexts = [
            flight.flightId.padEnd(7, ' '),
            flight.airport.padEnd(19, ' '),
            flight.time.padEnd(5, ' '),
            flight.status.padEnd(9, ' ')
        ];
        
        cells.forEach((cell, cellIndex) => {
            const chars = cell.querySelectorAll('.flap-char');
            const newText = newTexts[cellIndex];
            
            chars.forEach((charElement, charIndex) => {
                if (charIndex >= newText.length) return;
                
                const currentChar = charElement.textContent === '\u00A0' 
                    ? ' ' 
                    : charElement.textContent;
                
                const targetChar = newText[charIndex];
                
                if (currentChar !== targetChar) {
                    const delay = rowIndex * 150 + cellIndex * 100 + charIndex * 30;
                    animateSingleChar(charElement, currentChar, targetChar, delay);
                }
            });
        });
    });
}


// 단일 문자 스플릿 플랩 애니메이션
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
        }, 100);
        
    }, delay);
}


// 초기 로드
loadAirportData().then(() => {
    fetchAllData();
});


// 10초마다 페이지 로테이션
setInterval(rotatePage, ROTATION_INTERVAL);


// 3분마다 API 새로 받기
setInterval(fetchAllData, API_INTERVAL);


// 화면 크기 변경시 재계산 (디바운스 적용)
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const newRowsPerPage = getRowsPerPage();
        
        // 행 수가 변경되었을 때만 업데이트
        if (newRowsPerPage !== ROWS_PER_PAGE) {
            console.log(`Rows updated: ${ROWS_PER_PAGE} → ${newRowsPerPage}`);
            ROWS_PER_PAGE = newRowsPerPage;
            currentPage = 0; // 첫 페이지로 리셋
            displayCurrentPage(); // 화면 갱신
        }
    }, 500); // 0.5초 대기 (리사이즈 끝날 때까지)
});
