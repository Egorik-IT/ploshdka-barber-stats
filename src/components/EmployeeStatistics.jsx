import ActivityChart from './ActivityChart';
import ReportMetrics from './ReportMetrics';

export default function EmployeeStatistics({ result }) {
    const percent = result.commissionPercent;
    return <>
        <ActivityChart days={result.activity} />
  <section className="report-section">
   <h2>Клиентская база на {result.query.end}</h2>
   <p className="report-note">Состояние базы на конечную дату отчёта. Начальная дата периода на эти два показателя не влияет.</p>
   <ReportMetrics metrics={[["Постоянные",result.clients.regular],["Потерянные",result.clients.lost]]}/>
   <p className="report-note">Постоянные — два последних завершённых визита клиента были к этому сотруднику, оба менее {result.activeMonths} месяцев назад. Потерянные — два последних завершённых визита были к нему, но с последнего прошло {result.activeMonths} месяцев или больше. Проверяется история всех мастеров подключённых активных филиалов; отмены и неявки не учитываются.</p>
  </section>
  <section className="report-section">
   <h2>Клиенты за выбранный период</h2>
   <ReportMetrics metrics={[["Пришли из постоянных",result.clients.regularVisited],["Вернувшиеся",result.clients.returned],["Новые у сотрудника",result.clients.new],["Неявки (записи)",result.clients.noShows]]}/>
   <p className="report-note">Пришли из постоянных — были постоянными на начало периода и посетили сотрудника в этом периоде. Вернувшиеся — пришли после перерыва не менее {result.activeMonths} месяцев между выполненными визитами. Новые — первый выполненный визит к сотруднику в этом периоде. В каждой карточке клиент считается один раз; группы могут пересекаться. Неявки считаются по записям.</p>
  </section>
  <section className="report-section">
   <h2>Косметика за выбранный период</h2>
   <ReportMetrics metrics={[["Товаров продано",result.units],["Продажи косметики, ₽",result.products],["Заработок с косметики, ₽",percent==null?'—':(result.products*percent/100).toFixed(2)]]}/>
  </section>
  <p className="report-note">Все показатели относятся к YCLIENTS ID выбранного сотрудника. Клиенты объединяются по телефону, при его отсутствии — по ID клиента внутри филиала.</p>
 </>;
}
