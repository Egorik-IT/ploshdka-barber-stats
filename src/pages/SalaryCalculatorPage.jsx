import useViewMode from '../hooks/useViewMode';
import { useEffect, useState } from 'react';
import money from '../utils/formatMoney';
import { fetchApi, readJsonResponse } from '../utils/api';
import { calculateSalary, sumSalaries } from '../../shared/salary';
import { getPeriodDates } from '../utils/periods';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import SalaryCalculationCard from '../components/SalaryCalculationCard';
import { calculationNames, resolveCalculationRates } from '../../shared/calculationSettings';
import '../styles/reports.css';
import './SalaryCalculatorPage.css';

function calculationResult(item) {
    try {
        if (item.type !== 'manual' && !item.loaded) return null;
        return item.days.length === 0 && ['services','admin'].includes(item.type) ? 0 : calculateSalary(item);
    } catch { return null; }
}
function totalFor(items, round = false) {
    const values = items.map(calculationResult);
    if (!values.length || values.some(value => value === null)) return null;
    try {
        const sum = sumSalaries(values);
        return round ? Math.ceil(sum / 1000) * 1000 : sum;
    } catch { return null; }
}
export default function SalaryCalculatorPage() {
    const {mode}=useViewMode();
    const [settings,setSettings]=useState(null),[users,setUsers]=useState([]),[me,setMe]=useState(null);
    const [error,setError]=useState(''),[items,setItems]=useState([]),[userId,setUserId]=useState('');
    const [employees,setEmployees]=useState([]),[roundEmployees,setRoundEmployees]=useState({});
    useUnsavedChanges({isDirty:items.length>0 || employees.length>0,transient:true});
    useEffect(()=>{
        const controller=new AbortController();
        Promise.all(['/api/settings','/api/reports/employees','/api/auth/me'].map(path=>fetchApi(path,{signal:controller.signal}).then(readJsonResponse)))
            .then(([s,u,a])=>{if(!controller.signal.aborted){setSettings(s);setUsers(u.users);setMe(a.user);}})
            .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
        return ()=>controller.abort();
    },[]);
    const update=(id,patch)=>setItems(current=>current.map(item=>item.id===id?{...item,...patch}:item));
    function addEmployee() {
        const employee=users.find(user=>String(user.id)===userId);
        if(!employee?.category){setError('Не удалось определить категорию сотрудника. Проверьте его привязку и должность в YCLIENTS, затем синхронизируйте филиал.');return;}
        setEmployees(current=>current.includes(employee.id)?current:[...current,employee.id]);setUserId('');setError('');
    }
    function add(type,employee) {
        if(!settings||!employee)return;
        const category=mode==='manager'?employee.category:mode==='admin'?'admin':settings.personalCategory;
        const defaults=mode==='manager' ? employee.rates : resolveCalculationRates(category, settings.personal, settings.profile?.rates);
        setItems(current=>[...current,{id:crypto.randomUUID(),view:mode,userId:employee.id,name:employee.displayName,type,category,
            periodPreset:'currentMonth',...getPeriodDates('currentMonth'),rate:defaults.rate??'',percent:(type==='products'?defaults.productPercent:defaults.servicePercent)??'',
            cleaningRate:defaults.cleaningRate??'',bonus:0,amount:'',preset:'free',seniorBonus:defaults.seniorBonus,contentBonus:defaults.contentBonus,
            mode:'period',days:[],loaded:false}]);
    }
    async function load(item) {
        update(item.id,{loading:true,error:''});
        try {
            const query=new URLSearchParams({userId:item.userId,start:item.start,end:item.end});
            const data=await fetchApi(`/api/reports/employee?${query}`).then(readJsonResponse);
            setItems(current=>current.map(value=>value.id===item.id&&value.start===item.start&&value.end===item.end
                ?{...value,days:data.days,amount:item.type==='products'?data.products:value.amount,loaded:true,loading:false}:value));
        }catch(e){update(item.id,{loading:false,error:e.message});}
    }
    const visible=items.filter(item=>item.view===mode);
    const groups=employees.map(id=>users.find(user=>user.id===id)).filter(Boolean);
    const groupTotals=groups.map(user=>totalFor(visible.filter(item=>item.userId===user.id),roundEmployees[user.id]));
    let total=mode==='manager'?null:totalFor(visible);
    if(mode==='manager'&&groupTotals.length&&groupTotals.every(value=>value!==null)) {
        try{total=sumSalaries(groupTotals);}catch{total=null;}
    }
    function actions(employee,category) {
        return <div className="salary-add-actions">{(category==='admin'?['admin','products','manual']:['services','products','manual']).map(type=>
            <button key={type} disabled={!settings||!employee} onClick={()=>add(type,employee)}>Добавить: {calculationNames[type]}</button>)}</div>;
    }
    function cards(list) {
        return list.map(item=><SalaryCalculationCard key={item.id} item={item} update={update} load={load} value={calculationResult(item)}
            onRemove={()=>setItems(current=>current.filter(value=>value.id!==item.id))}/>);
    }
    return <div className="report-content">
        <header className="report-heading"><h1>Калькулятор зарплаты</h1><p>Пробный расчёт: изменение чисел не меняет утверждённые ставки и рейтинг. Расчёты не сохраняются.</p></header>
        {error&&<p className="report-error" role="alert">{error}</p>}
        {mode==='manager'?<>
            <div className="report-filters salary-employee-picker"><label>Сотрудник<select value={userId} onChange={event=>setUserId(event.target.value)}>
                <option value="">Выберите сотрудника</option>{users.filter(user=>!employees.includes(user.id)&&user.role!=='developer').map(user=>
                    <option key={user.id} value={user.id}>{user.displayName} · {user.categoryLabel}</option>)}
            </select></label><button disabled={!userId} onClick={addEmployee}>Добавить сотрудника</button></div>
            {groups.map((employee,index)=><section className="salary-employee" key={employee.id}>
                <header className="salary-card-heading"><div><h2>{employee.displayName}</h2><p className="report-note">{employee.categoryLabel} · утверждённые ставки сотрудника</p></div>
                    <button onClick={()=>{setEmployees(current=>current.filter(id=>id!==employee.id));setItems(current=>current.filter(item=>item.view!=='manager'||item.userId!==employee.id));}}>Убрать сотрудника</button></header>
                {actions(employee,employee.category)}
                {cards(visible.filter(item=>item.userId===employee.id))}
                <footer className="salary-employee-total"><label className="salary-cleaning"><input type="checkbox" checked={Boolean(roundEmployees[employee.id])}
                    onChange={event=>setRoundEmployees(current=>({...current,[employee.id]:event.target.checked}))}/>Округлить итог вверх до 1 000 ₽</label>
                    <strong>Итого: {groupTotals[index]===null?'—':money(groupTotals[index])}</strong></footer>
            </section>)}
        </>:<>{actions(me,mode==='admin'?'admin':'barber')}{cards(visible)}</>}
        <div className="salary-total"><span>ИТОГО</span><strong>{total===null?'—':money(total)}</strong></div>
    </div>;
}
