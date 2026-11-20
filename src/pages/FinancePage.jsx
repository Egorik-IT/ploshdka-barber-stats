import ReportFreshness from '../components/ReportFreshness';
import ActivityChart from '../components/ActivityChart';
import ReportBarChart from '../components/ReportBarChart';
import ReportMetrics from "../components/ReportMetrics";
import money from "../utils/formatMoney";
import { useEffect, useState } from 'react';
import { fetchApi, readJsonResponse } from '../utils/api';
import usePeriod from '../hooks/usePeriod';
import PeriodFields from '../components/PeriodFields';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import '../styles/reports.css';
export default function FinancePage(){
 const period=usePeriod();const [branches,setBranches]=useState([]),[branchId,setBranchId]=useState(''),[report,setReport]=useState(null),[entries,setEntries]=useState(null),[saved,setSaved]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const {confirmLeave}=useUnsavedChanges({isDirty:JSON.stringify(entries)!==JSON.stringify(saved)});
 useEffect(()=>{const c=new AbortController();fetchApi('/api/branches',{signal:c.signal}).then(readJsonResponse).then(d=>{if(!c.signal.aborted)setBranches(d.branches);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>c.abort();},[]);
 async function load(){if(!await confirmLeave())return;setBusy(true);setError('');try{const query={...period.dates,branchId};const d=await fetchApi('/api/reports/finance?'+new URLSearchParams(query)).then(readJsonResponse);setReport({...d,query});setEntries(d.entries);setSaved(d.entries);}catch(e){setError(e.message);}finally{setBusy(false);}}
 async function save(){setBusy(true);setError('');try{const d=await fetchApi('/api/reports/finance',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...report.query,entries})}).then(readJsonResponse);setEntries(d);setSaved(d);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const paid=entries?Number(entries.barbers)+Number(entries.admins):0,expenses=paid+Number(entries?.other||0);
 return <div className="report-content"><header className="report-heading"><h1>Финансы</h1><p>Выручка и расходы по филиалам</p></header><div className="report-filters report-filters-finance"><label>Филиал<select value={branchId} onChange={e=>setBranchId(e.target.value)}><option value="">Все филиалы</option>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><PeriodFields {...period}/></div><button disabled={busy||period.invalidDates} onClick={load}>{busy?'Загрузка…':'Показать'}</button>{error&&<p className="report-error" role="alert">{error}</p>}
 {report&&<><p className="report-note">Отчёт: {report.query.start} — {report.query.end}. Услуги учитываются по выполненным визитам, товары — по операциям продажи за вычетом возвратов.</p><ReportMetrics metrics={[['Услуги',report.services],['Косметика',report.products],['Общая выручка',report.total]].map(([label,value])=>[label,money(value)])}/>
 <ReportFreshness report={report} />
 <ActivityChart days={report.activity} revenueOnly />
 <ReportBarChart title="Выручка по филиалам" description="Услуги выполненных визитов и продажи косметики за вычетом возвратов. Выплаты сотрудникам не вычитаются." data={report.branchTotals || []} unit="₽" />
 <section className="report-section"><h2>Выплаты и расходы</h2><div className="report-filters">{Object.entries({barbers:'Выплаты барберам',admins:'Выплаты администраторам',other:'Прочие расходы'}).map(([key,label])=><label key={key}>{label}, ₽<input type="number" min="0" max="1000000000" step="0.01" value={entries[key]} disabled={busy} onChange={e=>setEntries(current=>({...current,[key]:e.target.value===''?'':Number(e.target.value)}))}/></label>)}</div><button disabled={busy||Object.values(entries).some(v=>typeof v!=='number'||v<0)||JSON.stringify(entries)===JSON.stringify(saved)} onClick={save}>Сохранить расходы</button></section>
 <ReportMetrics metrics={[['Всего выплат',paid],['Всего расходов',expenses],['Остаток',report.total-expenses]].map(([label,value])=>[label,money(value)])}/><p className="report-note">Введённые расходы сохраняются для выбранного филиала и точного периода отчёта. Остаток = выручка − выплаты − прочие расходы.</p></>}
 </div>;
}
