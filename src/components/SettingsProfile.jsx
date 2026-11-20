import { useState } from 'react';
import { getInitials, roleNames } from '../utils/users';

export default function SettingsProfile({ profile }) {
    const [failedPhoto,setFailedPhoto]=useState('');
    if (!profile?.yclientsLinks?.length) return null;
    return <section className="settings-panel settings-profile">
        <header className="settings-profile-header">
            <div className="settings-profile-avatar">{profile.photo && failedPhoto!==profile.photo
                ? <img src={profile.photo} alt={profile.displayName} onError={()=>setFailedPhoto(profile.photo)}/>
                : <span>{getInitials(profile.displayName)}</span>}</div>
            <div><h2>{profile.displayName}</h2><p>{profile.categoryLabel} · {roleNames[profile.role]||profile.role}</p><p>Логин: {profile.username}</p></div>
        </header>
        <div className="settings-profile-links">{profile.yclientsLinks.map(link=><article key={link.branchId+':'+link.staffId}>
            <h3>{link.branchName}</h3><p>{link.name||profile.displayName}</p>
            <dl><div><dt>YCLIENTS ID</dt><dd>{link.staffId}</dd></div>
                <div><dt>Специализация</dt><dd>{link.specialization||link.position||'—'}</dd></div>
                <div><dt>Телефон</dt><dd>{link.phone||'—'}</dd></div>
                <div><dt>Email</dt><dd>{link.email||'—'}</dd></div></dl>
        </article>)}</div>
        <p className="report-note">Данные привязки обновляются при синхронизации филиала. Редактирование аккаунта — в профиле сотрудника.</p>
    </section>;
}
