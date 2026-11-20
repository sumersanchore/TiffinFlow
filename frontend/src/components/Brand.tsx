import './Brand.css'

export function Brand(){
  return <span className="brand" role="img" aria-label="TharLogic Lead Management">
    <span className="brand-logo"><img src="/tharlogic-logo.png" alt=""/></span>
    <span className="brand-copy"><strong>LEADS</strong><small>MANAGEMENT</small></span>
  </span>
}
