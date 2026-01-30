// api/flights.js
export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 요청 처리 (pre-flight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET 요청만 허용
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 쿼리 파라미터 가져오기
    const { type, date } = req.query;
    
    if (!type || !date) {
      return res.status(400).json({ 
        error: 'Missing parameters. Required: type, date' 
      });
    }

    // API 엔드포인트 설정
    const operation = type === 'arrival' 
      ? '/getFltArrivalsDeOdp' 
      : '/getFltDeparturesDeOdp';
    
    const apiUrl = 'https://apis.data.go.kr/B551177/statusOfAllFltDeOdp' + operation;
    
    // 환경변수에서 API 키 가져오기
    const apiKey = process.env.AIRPORT_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    // 실제 API 호출 (searchDate 사용 및 numOfRows를 4000으로 증가)
    // 하루 전체 운항편을 가져와야 현재 시간대 데이터를 필터링할 수 있음
    const targetUrl = `${apiUrl}?serviceKey=${apiKey}&searchDate=${date}&numOfRows=4000&pageNo=1`;
    
    console.log('API Request:', targetUrl.replace(apiKey, '***'));
    
    const response = await fetch(targetUrl);
    const data = await response.text();

    // XML 응답 그대로 반환
    res.setHeader('Content-Type', 'text/xml');
    return res.status(200).send(data);
    
  } catch (error) {
    console.error('Proxy error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch flight data',
      details: error.message 
    });
  }
}
