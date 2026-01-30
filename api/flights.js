export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type, date } = req.query;
    
    if (!type || !date) {
      return res.status(400).json({ 
        error: 'Missing parameters. Required: type, date' 
      });
    }

    const operation = type === 'arrival' 
      ? '/getFltArrivalsDeOdp' 
      : '/getFltDeparturesDeOdp';
    
    const apiUrl = 'https://apis.data.go.kr/B551177/statusOfAllFltDeOdp' + operation;
    
    const apiKey = process.env.AIRPORT_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'API key not configured' });
    }

    const targetUrl = `${apiUrl}?serviceKey=${apiKey}&schDate=${date}&numOfRows=100&pageNo=1`;
    
    const response = await fetch(targetUrl);
    const data = await response.text();

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
