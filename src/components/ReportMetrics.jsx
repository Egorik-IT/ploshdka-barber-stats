export default function ReportMetrics({ metrics }) {
    return <div className="report-grid">
        {metrics.map(([label, value]) => <article className="report-card" key={label}>
            <h3>{label}</h3>
            <div className="report-value">{value}</div>
        </article>)}
    </div>;
}
