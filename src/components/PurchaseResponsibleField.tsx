"use client";

interface Props {
  person: string;
  onChange: (person: string) => void;
  suggestions: string[];
}

export default function PurchaseResponsibleField({ person, onChange, suggestions }: Props) {
  const linked = person !== "";
  return (
    <div className="form-group">
      <label className="form-label">Responsável pela compra</label>
      {!linked ? (
        <button type="button" className="btn-secondary" onClick={() => onChange(" ")}
          style={{ width: "100%", justifyContent: "space-between" }}>
          <span>Eu</span><span>Vincular outra pessoa</span>
        </button>
      ) : (
        <div style={{ display: "flex", gap: "8px" }}>
          <input className="form-input" value={person.trimStart()} onChange={event => onChange(event.target.value || " ")}
            list="purchase-responsible-suggestions" placeholder="Nome da pessoa" maxLength={60} autoComplete="off"
            aria-label="Nome da pessoa responsável" style={{ flex: 1, minWidth: 0 }} />
          <button type="button" className="btn-secondary" onClick={() => onChange("")}>Eu</button>
          <datalist id="purchase-responsible-suggestions">
            {suggestions.map(name => <option key={name} value={name} />)}
          </datalist>
        </div>
      )}
      {linked && <p style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "6px" }}>
        O valor total e todas as parcelas ficam com essa pessoa.
      </p>}
    </div>
  );
}
