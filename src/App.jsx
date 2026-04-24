// v2
import { useState, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, Line, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Area
} from "recharts";

const TICKERS = ["BTC","ETH","SOL","GOLD","SILVER","NVDA","AAPL","TSLA","SVM","CEMEX","AMZN"];

const AGENT_META = [
  { id:"fundamental", label:"① Fundamental",          icon:"◈", color:"#7c6bff" },
  { id:"tecnico",     label:"② Técnico",               icon:"◎", color:"#38bdf8" },
  { id:"riesgo",      label:"③ Riesgo / Sentimiento",  icon:"◉", color:"#fb923c" },
  { id:"sintesis",    label:"④ Síntesis & Veredicto",  icon:"◆", color:"#4ade80" },
];

// ── Llamada al proxy seguro (API key en el servidor, nunca expuesta al browser) ──
async function callClaude(body) {
  const res = await fetch("/.netlify/functions/anthropic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || "HTTP " + res.status);
  if (data?.type === "error") throw new Error(JSON.stringify(data.error));
  return data;
}

function last12Months() {
  const now = new Date();
  const meses = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  return Array.from({length:12}, (_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    return `${meses[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
  });
}

function fmtPrice(n) {
  const num = Number(n);
  if (!num || isNaN(num)) return "—";
  if (num >= 1000) return num.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
  if (num >= 1)    return num.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:4});
  return num.toLocaleString("en-US",{minimumFractionDigits:4,maximumFractionDigits:6});
}

// ── Paso 1: obtener precio real con web_search ──
async function fetchRealPrice(ticker) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"});
  const data = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: `Eres un asistente financiero. Hoy es ${dateStr}.
Busca el precio actual de mercado del activo y responde ÚNICAMENTE con JSON:
{"price": 123.45, "change24h": -1.2, "source": "nombre fuente"}
Sin markdown, sin texto adicional. Solo el JSON.`,
    messages: [{
      role: "user",
      content: `Precio actual en USD de ${ticker} hoy ${dateStr}. Solo el JSON.`
    }]
  });
  const text = (data.content||[])
    .map(b => b.type==="text" ? b.text : "")
    .join("").trim()
    .replace(/^```json\s*/,"").replace(/\s*```$/,"").trim();
  try {
    const parsed = JSON.parse(text);
    if (parsed.price > 0) return parsed;
  } catch {}
  return null;
}

// ── Paso 2: análisis multiagente ──
async function fetchAnalysis(ticker, horizon, profile, priceInfo, months) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-MX",{day:"numeric",month:"long",year:"numeric"});
  const p = priceInfo?.price;

  const system = `Eres un sistema multiagente de análisis de inversiones de alta precisión.
Hoy es ${dateStr}.
${p ? `PRECIO ACTUAL REAL CONFIRMADO: $${p} USD (fuente: ${priceInfo.source})` : "Usa el precio más reciente conocido."}

REGLAS OBLIGATORIAS:
- chart debe tener exactamente estos 12 meses: ${months.join(", ")}
- Precio del último mes (${months[11]}) = $${p||0}
- Entrada, stopLoss, objetivo1, objetivo2 calculados sobre $${p||0}
- Responde SOLO con JSON válido, sin markdown

{
  "fundamental": "<mín. 150 palabras>",
  "tecnico": "<mín. 150 palabras>",
  "riesgo": "<mín. 150 palabras>",
  "sintesis": "<mín. 150 palabras>",
  "veredicto": "COMPRAR",
  "confianza": 70,
  "entrada": ${p||0},
  "stopLoss": ${p?(p*0.91).toFixed(2):0},
  "objetivo1": ${p?(p*1.18).toFixed(2):0},
  "objetivo2": ${p?(p*1.38).toFixed(2):0},
  "rr": 2.0,
  "chart": [
    ${months.map((m,i)=>`{"mes":"${m}","precio":${i===11?(p||0):0},"ma20":0,"ma50":0}`).join(",\n    ")}
  ]
}`;

  const raw = await callClaude({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    system,
    messages: [{
      role: "user",
      content: `Análisis multiagente de ${ticker.toUpperCase()}. Horizonte: ${horizon}. Perfil: ${profile}. Fecha: ${dateStr}. Precio: $${p} USD.`
    }]
  });

  const txt = (raw.content||[]).map(b=>b.text||"").join("").trim()
               .replace(/^```json\s*/,"").replace(/\s*```$/,"").trim();
  return JSON.parse(txt);
}

const vcolor = { COMPRAR:"#4ade80", MANTENER:"#facc15", VENDER:"#f87171" };

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#0c0d10",border:"1px solid rgba(255,255,255,0.12)",borderRadius:8,padding:"10px 14px"}}>
      <div style={{color:"#6b6d7e",fontSize:10,fontFamily:"monospace",marginBottom:5}}>{label}</div>
      {payload.map(p=>(
        <div key={p.name} style={{color:p.color,fontSize:11,fontFamily:"monospace",marginBottom:2}}>
          {p.name}: <strong>${typeof p.value==="number"?p.value.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}):p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const [ticker,      setTicker]      = useState("");
  const [horizon,     setHorizon]     = useState("1 año");
  const [profile,     setProfile]     = useState("moderado");
  const [loading,     setLoading]     = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [data,        setData]        = useState(null);
  const [livePrice,   setLivePrice]   = useState(null);
  const [error,       setError]       = useState(null);
  const [open,        setOpen]        = useState(null);
  const inputRef = useRef(null);
  const months = last12Months();

  async function analyze() {
    if (!ticker.trim()) {
      inputRef.current?.classList.add("shake");
      setTimeout(()=>inputRef.current?.classList.remove("shake"),500);
      inputRef.current?.focus();
      return;
    }
    setLoading(true); setData(null); setError(null); setOpen(null); setLivePrice(null);
    try {
      setLoadingStep(`🔍 Buscando precio real de ${ticker}…`);
      const priceInfo = await fetchRealPrice(ticker);
      if (priceInfo) setLivePrice(priceInfo);

      setLoadingStep("⚙ Ejecutando 4 agentes de análisis…");
      const result = await fetchAnalysis(ticker, horizon, profile, priceInfo, months);

      if (priceInfo?.price && result.chart?.length > 0) {
        result.chart[result.chart.length-1].precio = priceInfo.price;
        result.entrada = priceInfo.price;
      }
      setData(result);
      setOpen("fundamental");
    } catch(e) {
      setError("Error al procesar. Intenta nuevamente.");
    } finally {
      setLoading(false); setLoadingStep("");
    }
  }

  return (
    <>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@400;600;700;800&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      :root{
        --bg:#0c0d10;--sf:#13141a;--s2:#1a1b24;
        --bd:rgba(255,255,255,0.07);--bda:rgba(255,255,255,0.16);
        --tx:#f0f0f5;--mu:#6b6d7e;--di:#9698a8;
        --ac:#7c6bff;--gl:rgba(124,107,255,0.22);
        --fn:'DM Mono',monospace;--fs:'Syne',sans-serif;--rr:12px;
      }
      @media(prefers-color-scheme:light){:root{
        --bg:#f2f2f6;--sf:#fff;--s2:#ebebef;
        --bd:rgba(0,0,0,0.07);--bda:rgba(0,0,0,0.18);
        --tx:#0c0d10;--mu:#9698a8;--di:#5a5c6e;--gl:rgba(124,107,255,0.12);
      }}
      body{background:var(--bg)}
      .w{font-family:var(--fs);background:var(--bg);color:var(--tx);min-height:100vh;padding:28px 16px 80px;max-width:740px;margin:0 auto}
      .eye{font-family:var(--fn);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--ac);margin-bottom:6px}
      h1{font-size:clamp(21px,4.5vw,29px);font-weight:800;letter-spacing:-.03em;line-height:1.1}
      .sub{margin-top:7px;font-size:12px;color:var(--mu);font-family:var(--fn)}
      .card{background:var(--sf);border:1px solid var(--bd);border-radius:var(--rr);padding:20px;margin-bottom:12px}
      .tw{position:relative;margin-bottom:12px}
      .tl{font-family:var(--fn);font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--mu);position:absolute;top:9px;left:14px}
      .ti{width:100%;background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--fn);font-size:20px;font-weight:500;letter-spacing:.08em;padding:26px 14px 10px;outline:none;transition:border-color .2s,box-shadow .2s;text-transform:uppercase}
      .ti::placeholder{color:var(--mu);font-size:14px;letter-spacing:0}
      .ti:focus{border-color:var(--ac);box-shadow:0 0 0 3px var(--gl)}
      .ti.shake{animation:sh .4s}
      @keyframes sh{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
      .rw{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
      @media(max-width:420px){.rw{grid-template-columns:1fr}}
      .sw{display:flex;flex-direction:column;gap:4px}
      .sl_{font-family:var(--fn);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--mu)}
      .sc{background:var(--s2);border:1px solid var(--bd);border-radius:8px;color:var(--tx);font-family:var(--fn);font-size:12px;padding:9px 10px;outline:none;cursor:pointer;-webkit-appearance:none;width:100%}
      .sc:focus{border-color:var(--ac)}
      .ql{font-family:var(--fn);font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--mu);margin-bottom:7px}
      .qr{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
      .qb{font-family:var(--fn);font-size:11px;padding:4px 10px;border-radius:6px;background:var(--s2);border:1px solid var(--bd);color:var(--di);cursor:pointer;transition:all .15s}
      .qb:hover,.qb.on{border-color:var(--ac);color:var(--tx);background:var(--gl)}
      .abtn{width:100%;padding:14px;border-radius:10px;background:var(--ac);color:#fff;font-family:var(--fs);font-size:15px;font-weight:700;border:none;cursor:pointer;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 20px var(--gl);display:flex;align-items:center;justify-content:center;gap:8px}
      .abtn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 8px 28px var(--gl)}
      .abtn:disabled{opacity:.5;cursor:not-allowed}
      .sp{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}
      @keyframes spin{to{transform:rotate(360deg)}}
      .pc{border-radius:var(--rr);padding:24px;margin-bottom:12px;animation:fi .35s ease}
      @keyframes fi{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
      .pc-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;display:inline-block;margin-right:6px;animation:blink 1.4s infinite;vertical-align:middle}
      @keyframes blink{0%,100%{opacity:1}50%{opacity:.2}}
      .pc-lbl{font-family:var(--fn);font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:#4ade80;opacity:.75;margin-bottom:10px}
      .pc-price{font-size:clamp(40px,9vw,60px);font-weight:800;letter-spacing:-.04em;line-height:1;color:#4ade80;margin-bottom:6px}
      .pc-row{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
      .pc-usd{font-family:var(--fn);font-size:13px;color:#4ade80;opacity:.5}
      .pc-chg{font-family:var(--fn);font-size:12px;font-weight:600}
      .pc-meta{font-family:var(--fn);font-size:10px;color:var(--mu);margin-top:8px}
      .sk{border-radius:var(--rr);background:linear-gradient(90deg,var(--s2) 25%,var(--bd) 50%,var(--s2) 75%);background-size:200% 100%;animation:ske 1.4s infinite}
      @keyframes ske{0%{background-position:200% 0}100%{background-position:-200% 0}}
      .step{font-family:var(--fn);font-size:11px;color:var(--di);text-align:center;padding:8px 0 6px}
      .vb{border-radius:var(--rr);padding:18px 20px;margin-bottom:12px;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:14px;animation:fi .4s ease}
      .vtg{font-size:22px;font-weight:800;letter-spacing:-.02em;margin-top:4px}
      .vmt{font-family:var(--fn);font-size:11px;margin-top:3px;opacity:.6}
      .vls{display:flex;gap:16px;flex-wrap:wrap}
      .vl{font-family:var(--fn);font-size:11px;display:flex;flex-direction:column;gap:3px}
      .vl span:first-child{font-size:9px;letter-spacing:.1em;text-transform:uppercase;opacity:.5}
      .vl span:last-child{font-weight:600;font-size:14px}
      .al{display:flex;flex-direction:column;gap:8px;margin-bottom:12px}
      .ah{display:flex;align-items:center;gap:10px;padding:14px 16px;background:var(--sf);border:1px solid var(--bd);border-radius:var(--rr);cursor:pointer;transition:border-color .18s;user-select:none}
      .ah:hover,.ah.op{border-color:var(--bda)}
      .ah.op{border-bottom-left-radius:0;border-bottom-right-radius:0}
      .an{font-size:14px;font-weight:700;flex:1}
      .ac_{font-family:var(--fn);font-size:10px;color:var(--mu);transition:transform .2s}
      .ac_.op{transform:rotate(180deg)}
      .ab_{padding:16px;background:var(--sf);border:1px solid var(--bda);border-top:none;border-radius:0 0 var(--rr) var(--rr);font-family:var(--fn);font-size:12px;line-height:1.8;color:var(--di);animation:fi .25s ease;white-space:pre-wrap}
      .cc{background:var(--sf);border:1px solid var(--bd);border-radius:var(--rr);padding:20px;margin-bottom:12px;animation:fi .5s ease}
      .ct{font-family:var(--fn);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--di);margin-bottom:16px}
      .er{background:#1e0e0e;border:1px solid #f87171;border-radius:var(--rr);padding:12px 16px;font-family:var(--fn);font-size:12px;color:#f87171;margin-bottom:12px}
    `}</style>

    <div className="w">
      <div style={{marginBottom:28}}>
        <div className="eye">Sistema multiagente · v7.0</div>
        <h1>Analizador de inversiones <span style={{color:"var(--ac)"}}>·</span> IA</h1>
        <p className="sub">4 agentes · precio en tiempo real · gráfica hasta {months[11]}</p>
      </div>

      <div className="card">
        <div className="tw">
          <span className="tl">Activo / Ticker</span>
          <input ref={inputRef} className="ti" placeholder="ej. SOL, AAPL, BTC"
            value={ticker} maxLength={10}
            onChange={e=>setTicker(e.target.value.toUpperCase())}
            onKeyDown={e=>e.key==="Enter"&&analyze()}/>
        </div>
        <div className="rw">
          <div className="sw">
            <span className="sl_">Horizonte</span>
            <select className="sc" value={horizon} onChange={e=>setHorizon(e.target.value)}>
              {["3 meses","1 año","5+ años"].map(h=><option key={h}>{h}</option>)}
            </select>
          </div>
          <div className="sw">
            <span className="sl_">Perfil</span>
            <select className="sc" value={profile} onChange={e=>setProfile(e.target.value)}>
              {["conservador","moderado","agresivo"].map(p=><option key={p}>{p}</option>)}
            </select>
          </div>
        </div>
        <div className="ql">Accesos rápidos</div>
        <div className="qr">
          {TICKERS.map(t=>(
            <button key={t} className={`qb ${ticker===t?"on":""}`} onClick={()=>setTicker(t)}>{t}</button>
          ))}
        </div>
        <button className="abtn" onClick={analyze} disabled={loading}>
          {loading ? <><span className="sp"/> {loadingStep||"Analizando…"}</> : <>Analizar ↗</>}
        </button>
      </div>

      {error && <div className="er">⚠ {error}</div>}

      {livePrice && (
        <div className="pc" style={{
          background:"linear-gradient(135deg,rgba(74,222,128,0.13) 0%,rgba(74,222,128,0.04) 100%)",
          border:"1px solid rgba(74,222,128,0.32)",
        }}>
          <div className="pc-lbl"><span className="pc-dot"/>Precio actual · {ticker}</div>
          <div className="pc-price">${fmtPrice(livePrice.price)}</div>
          <div className="pc-row">
            <span className="pc-usd">USD</span>
            {livePrice.change24h != null && (
              <span className="pc-chg" style={{color:livePrice.change24h>=0?"#4ade80":"#f87171"}}>
                {livePrice.change24h>=0?"▲":"▼"} {Math.abs(livePrice.change24h).toFixed(2)}% 24h
              </span>
            )}
          </div>
          <div className="pc-meta">Fuente: {livePrice.source} · {new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"})} · {new Date().toLocaleDateString("es-MX",{day:"numeric",month:"short",year:"numeric"})}</div>
        </div>
      )}

      {loading && <>
        <div className="step">{loadingStep}</div>
        {!livePrice && <div className="sk" style={{height:130,marginBottom:12}}/>}
        <div className="sk" style={{height:80,marginBottom:12}}/>
        {[0,1,2,3].map(i=><div key={i} className="sk" style={{height:52,marginBottom:8}}/>)}
        <div className="sk" style={{height:290,marginTop:4}}/>
      </>}

      {data && <>
        <div className="vb" style={{
          background:`linear-gradient(135deg,${vcolor[data.veredicto]||"#7c6bff"}18,${vcolor[data.veredicto]||"#7c6bff"}04)`,
          border:`1px solid ${vcolor[data.veredicto]||"#7c6bff"}44`,
        }}>
          <div>
            <div style={{fontFamily:"var(--fn)",fontSize:10,color:"var(--di)",marginBottom:2}}>{ticker} · {horizon} · {profile}</div>
            <div className="vtg" style={{color:vcolor[data.veredicto]||"#fff"}}>{data.veredicto}</div>
            <div className="vmt">Confianza: <strong>{data.confianza}%</strong> · R/R: <strong>{data.rr}x</strong></div>
          </div>
          <div className="vls">
            {[["Entrada",data.entrada,"#38bdf8"],["Stop Loss",data.stopLoss,"#f87171"],["Obj. 1",data.objetivo1,"#4ade80"],["Obj. 2",data.objetivo2,"#a3e635"]].map(([lbl,val,col])=>(
              <div className="vl" key={lbl}>
                <span>{lbl}</span>
                <span style={{color:col}}>${fmtPrice(val)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="al">
          {AGENT_META.map(a=>(
            <div key={a.id}>
              <div className={`ah ${open===a.id?"op":""}`} onClick={()=>setOpen(open===a.id?null:a.id)}>
                <span style={{fontSize:16,color:a.color,flexShrink:0}}>{a.icon}</span>
                <span className="an">{a.label}</span>
                <span className={`ac_ ${open===a.id?"op":""}`}>▼</span>
              </div>
              {open===a.id && <div className="ab_">{data[a.id]||"Sin datos."}</div>}
            </div>
          ))}
        </div>

        {(data.chart||[]).length>0 && (
          <div className="cc">
            <div className="ct">{ticker} · {months[0]} → {months[11]}{livePrice?` · $${fmtPrice(livePrice.price)}`:""}</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={data.chart} margin={{top:4,right:8,left:0,bottom:0}}>
                <defs>
                  <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#7c6bff" stopOpacity={0.28}/>
                    <stop offset="95%" stopColor="#7c6bff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                <XAxis dataKey="mes" tick={{fontFamily:"monospace",fontSize:10,fill:"#6b6d7e"}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontFamily:"monospace",fontSize:10,fill:"#6b6d7e"}} axisLine={false} tickLine={false} width={64}
                  tickFormatter={v=>v>=1000?`$${(v/1000).toFixed(1)}k`:`$${v}`}/>
                <Tooltip content={<ChartTooltip/>}/>
                <Legend wrapperStyle={{fontFamily:"monospace",fontSize:10,paddingTop:10}}/>
                <Area type="monotone" dataKey="precio" name="Precio" stroke="#7c6bff" strokeWidth={2} fill="url(#pg)" dot={false}/>
                <Line type="monotone" dataKey="ma20" name="MA 20" stroke="#38bdf8" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                <Line type="monotone" dataKey="ma50" name="MA 50" stroke="#fb923c" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                <ReferenceLine y={data.entrada}   stroke="#38bdf8" strokeDasharray="5 3" strokeWidth={1.5} label={{value:"Entrada",   position:"insideTopRight",   fill:"#38bdf8",fontSize:9,fontFamily:"monospace"}}/>
                <ReferenceLine y={data.stopLoss}  stroke="#f87171" strokeDasharray="5 3" strokeWidth={1.5} label={{value:"Stop Loss", position:"insideBottomRight", fill:"#f87171",fontSize:9,fontFamily:"monospace"}}/>
                <ReferenceLine y={data.objetivo1} stroke="#4ade80" strokeDasharray="5 3" strokeWidth={1.5} label={{value:"Obj.1",     position:"insideTopRight",   fill:"#4ade80",fontSize:9,fontFamily:"monospace"}}/>
                <ReferenceLine y={data.objetivo2} stroke="#a3e635" strokeDasharray="5 3" strokeWidth={1.5} label={{value:"Obj.2",     position:"insideTopRight",   fill:"#a3e635",fontSize:9,fontFamily:"monospace"}}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </>}

      {!data && !loading && (
        <div className="card">
          <div style={{fontFamily:"var(--fn)",fontSize:9,letterSpacing:".15em",textTransform:"uppercase",color:"var(--di)",marginBottom:14}}>¿Qué incluye el análisis?</div>
          {[
            ["◈","#7c6bff","Fundamental","Valoración, ingresos, márgenes, deuda y moat competitivo"],
            ["◎","#38bdf8","Técnico","Tendencia, MA, RSI, MACD, volumen y patrones de precio"],
            ["◉","#fb923c","Riesgo / Sentimiento","Volatilidad, correlaciones, noticias y flujos institucionales"],
            ["◆","#4ade80","Síntesis + Gráfica","Veredicto + niveles reales de trading sobre precio actual"],
          ].map(([icon,col,name,desc])=>(
            <div key={name} style={{display:"flex",gap:12,marginBottom:12,alignItems:"flex-start"}}>
              <span style={{color:col,fontSize:16,marginTop:1,flexShrink:0}}>{icon}</span>
              <div>
                <div style={{fontSize:13,fontWeight:700,marginBottom:3}}>{name}</div>
                <div style={{fontSize:12,color:"var(--di)",fontFamily:"var(--fn)",lineHeight:1.6}}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
    </>
  );
}
