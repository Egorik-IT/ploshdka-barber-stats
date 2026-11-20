export default function ReportFreshness({ report }) {
    if (!report?.dataUpdatedAt) return null;
    return <p className="report-note">Данные YCLIENTS: {new Date(report.dataUpdatedAt).toLocaleString('ru-RU')}.
        {report.fromCache ? ' Использован кэш; обычные отчёты обновляются не чаще раза в 15 минут.' : ' Данные загружены из YCLIENTS.'}
        {' '}Для составного отчёта указано время самого старого использованного снимка.</p>;
}
