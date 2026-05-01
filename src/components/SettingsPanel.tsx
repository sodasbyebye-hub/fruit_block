import { languageNames, type Language, type Translation } from '../i18n';

interface SettingsPanelProps {
  labels: Translation;
  language: Language;
  effectsVolume: number;
  musicVolume: number;
  motionLevel: number;
  onLanguageChange: (language: Language) => void;
  onEffectsVolumeChange: (volume: number) => void;
  onMusicVolumeChange: (volume: number) => void;
  onMotionLevelChange: (level: number) => void;
  onClose: () => void;
}

export function SettingsPanel({
  labels,
  language,
  effectsVolume,
  musicVolume,
  motionLevel,
  onLanguageChange,
  onEffectsVolumeChange,
  onMusicVolumeChange,
  onMotionLevelChange,
  onClose,
}: SettingsPanelProps) {
  return (
    <section className="settings-panel" aria-label={labels.settings}>
      <header className="settings-header">
        <div>
          <p className="eyebrow">{labels.settings}</p>
          <h2>{labels.feel}</h2>
        </div>
        <button className="icon-button settings-close" title={labels.closeSettings} type="button" onClick={onClose}>
          X
        </button>
      </header>

      <div className="settings-row">
        <span>{labels.language}</span>
        <div className="language-options" role="group" aria-label={labels.language}>
          {(['zh', 'en', 'ja'] as Language[]).map((option) => (
            <button
              className={`language-option ${language === option ? 'is-selected' : ''}`}
              key={option}
              type="button"
              onClick={() => onLanguageChange(option)}
            >
              {languageNames[option]}
            </button>
          ))}
        </div>
      </div>

      <SliderRow
        label={labels.soundEffects}
        value={Math.round(effectsVolume * 100)}
        onChange={(value) => onEffectsVolumeChange(value / 100)}
      />
      <SliderRow label={labels.music} value={Math.round(musicVolume * 100)} onChange={(value) => onMusicVolumeChange(value / 100)} />
      <SliderRow label={labels.jellyMotion} max={160} value={motionLevel} onChange={onMotionLevelChange} suffix="%" />
    </section>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max?: number;
  suffix?: string;
}

function SliderRow({ label, value, onChange, max = 100, suffix = '' }: SliderRowProps) {
  return (
    <label className="settings-row">
      <span>
        {label}
        <strong>
          {value}
          {suffix || '%'}
        </strong>
      </span>
      <input
        max={max}
        min="0"
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </label>
  );
}
