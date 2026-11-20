import ReportFreshness from '../components/ReportFreshness';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import useViewMode from '../hooks/useViewMode';
import { fetchApi, readJsonResponse } from '../utils/api';
import { formatDateInput } from '../utils/periods';
import money from '../utils/formatMoney';
import ReportMetrics from '../components/ReportMetrics';
import ClientCard from '../components/ClientCard';
import './ClientsPage.css';
import './DashboardPage.css';

const statusNames={ '-1':'Не пришёл',0:'Ожидается',1:'Пришёл',2:'Подтвердил' };
export default function DashboardPage({ user }) {
    const {mode}=useViewMode();
    const [date,setDate]=useState(()=>formatDateInput(new Date()));
    const [result,setResult]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(true);
    const [retry,setRetry]=useState(0),[selected,setSelected]=useState(null);
    useEffect(()=>{
        const controller=new AbortController();
        async function load() {
            setBusy(true);setError('');setResult(null);
            try {
                const data=await fetchApi('/api/reports/day?'+new URLSearchParams({date,view:mode}),{signal:controller.signal}).then(readJsonResponse);
                if(!controller.signal.aborted)setResult(data);
            }catch(err){if(!controller.signal.aborted)setError(err.message);}
            finally{if(!controller.signal.aborted)setBusy(false);}
        }
        void load();return()=>controller.abort();
    },[date,mode,retry]);
    const totals=result?.branches.reduce((sum,branch)=>({appointments:sum.appointments+branch.appointments,completed:sum.completed+branch.completed,
        services:sum.services+branch.services,products:sum.products+branch.products}),{appointments:0,completed:0,services:0,products:0});
    return <div className="report-content">
        <header className="report-heading"><h1>Главная</h1><p>Здравствуйте, {user.displayName}! {mode==='barber'?'Ваши записи на выбранный день.':mode==='admin'?'Работающие барберы и записи филиалов.':'Обзор работы сети за выбранный день.'}</p></header>
        <div className="report-filters dashboard-day-filter"><label>Дата<input type="date" value={date} onChange={event=>{if(event.target.value)setDate(event.target.value);}}/></label>
            <button onClick={()=>setDate(formatDateInput(new Date()))}>Сегодня</button><button disabled={busy} onClick={()=>setRetry(value=>value+1)}>Повторить загрузку</button></div>
        <nav className="dashboard-shortcuts"><Link to="/statistics">Статистика сотрудников</Link><Link to="/calculator">Калькулятор</Link>{mode==='manager'&&<Link to="/finance">Финансы</Link>}</nav>
        {busy&&<p role="status">Загрузка записей…</p>}{error&&<p className="report-error" role="alert">{error}</p>}
        {result&&<>
 <ReportFreshness report={result} />
            <ReportMetrics metrics={mode==='manager'?
                [['Записей',totals.appointments],['Выполнено',totals.completed],['Выручка услуг',money(totals.services)],['Продажи косметики',money(totals.products)]]:
                [['Записей',totals.appointments],['Выполнено',totals.completed]]}/>
            {mode==='manager'&&<section className="report-section"><h2>Филиалы</h2><div className="report-grid">{result.branches.map(branch=><article className="report-card" key={branch.id}>
                <h3>{branch.name}</h3><p>{branch.appointments} записей · выполнено {branch.completed}</p><strong>{money(branch.services+branch.products)}</strong><p>Услуги и косметика</p>
            </article>)}</div></section>}
            <section className="report-section"><h2>{mode==='barber'?'Мои записи':'Расписание барберов'}</h2>
                {mode==='barber'&&!result.linked?<p>Для загрузки записей нужна привязка аккаунта к YCLIENTS.</p>:!result.groups.length?<p>На выбранный день смен и записей нет.</p>:result.groups.map(group=><article className="dashboard-schedule" key={group.branchId+':'+group.staffId}>
                    <header><div><h3>{group.name}</h3><p>{group.branchName} · {group.categoryLabel}</p></div><span>{group.slots.map(slot=>`${slot.from}–${slot.to}`).join(', ')||'Вне графика'}</span></header>
                    {!group.records.length?<p>Записей пока нет.</p>:<div className="clients-table-wrap"><table className="clients-table"><thead><tr><th>Время</th><th>Клиент</th><th>Услуги</th><th>Стоимость / оплата</th><th>Статус</th></tr></thead><tbody>
                        {group.records.map(record=><tr key={record.id}><td>{record.date.slice(11,16)}</td><td>{record.client?.id?<button className="client-name-button" onClick={()=>setSelected({branchId:group.branchId,person:record.client})}>{record.client.display_name||record.client.name||'Без имени'}</button>:'Клиент не указан'}</td>
                            <td>{record.services.join(', ')||'—'}</td><td>{money(record.amount)}<small className="employee-category-label">{record.paidFull?'Оплачено':record.paymentStatus==='paid_not_full'?'Частичная оплата — остаток в YCLIENTS':'К оплате за услуги'}</small></td><td>{statusNames[record.attendance]||'—'}</td></tr>)}
                    </tbody></table></div>}
                </article>)}
            </section>
        </>}
        {selected&&<ClientCard branchId={selected.branchId} person={selected.person} onClose={()=>setSelected(null)}/>}
    </div>;
}
