import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import './style.css';
import {validateFiles} from './core/validate';
import {getCustomers,upsertCustomer} from './core/customers';
import {addHistory,listHistory,getHistory} from './storage/history';

const labels={company:'Company',invoice_number:'Invoice Number',packing_list_number:'Packing List Number',surat_jalan:'Surat Jalan',total_cif:'Total CIF',total_gw:'Total GW',total_nw:'Total NW',package:'Kemasan',item_order:'Item Order',item_code:'Item Code',item_name:'Item Name',quantity:'Quantity'};
const docLabels={invoice:'Invoice',packing_list:'Packing List',surat_jalan:'Surat Jalan',draft_exim:'Draft CEISA'};

function App(){
  const [page,setPage]=useState('new');
  const [result,setResult]=useState(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const go=p=>{setPage(p);setError('');if(p!=='new')setResult(null)};
  return <div className="shell">
    <aside><div className="brand">EXIM<span>VALIDATION</span></div><div className="brand-sub">DOCUMENT CONTROL</div>
      <nav>{[['new','＋','New Validation'],['history','◷','History'],['customers','⚙','Customer Master']].map(([p,i,t])=><button key={p} className={page===p?'active':''} onClick={()=>go(p)}><span>{i}</span>{t}</button>)}</nav>
      <div className="side-note"><b>100% CLIENT-SIDE</b><br/>File stays in your browser<br/><small>GitHub Pages ready</small></div>
    </aside>
    <main><header className="top"><div><div className="eyebrow">EXIM DOCUMENT CONTROL</div><h1>{page==='new'?'New Validation':page==='history'?'Validation History':'Customer Master'}</h1></div><div className="pill"><i/> WEB · LOCAL PROCESSING</div></header>
      {page==='new'&&<NewValidation result={result} setResult={setResult} busy={busy} setBusy={setBusy} error={error} setError={setError}/>} 
      {page==='history'&&<History onOpen={x=>{setResult(x);setPage('new')}}/>}
      {page==='customers'&&<Customers/>}
    </main>
  </div>
}

function NewValidation({result,setResult,busy,setBusy,error,setError}){
  const [files,setFiles]=useState([]),[drag,setDrag]=useState(false);
  const addFiles=useCallback(list=>{
    const incoming=[...list].filter(f=>/\.(xlsx|xls|xlsm)$/i.test(f.name));
    setFiles(prev=>{const map=new Map(prev.map(f=>[f.name+f.size,f]));incoming.forEach(f=>map.set(f.name+f.size,f));return [...map.values()]});
    if(incoming.length===0)setError('Pilih file Excel (.xlsx, .xls, atau .xlsm).'); else setError('');
  },[setError]);
  const onDrop=e=>{e.preventDefault();setDrag(false);addFiles(e.dataTransfer.files)};
  const remove=name=>setFiles(prev=>prev.filter(f=>f.name!==name));
  const submit=async()=>{if(!files.length)return;setBusy(true);setError('');setResult(null);try{const j=await validateFiles(files);await addHistory(j);setResult(j)}catch(e){setError(e.message||'Validation gagal')}finally{setBusy(false)}};
  if(result)return <Result data={result} onNew={()=>setResult(null)}/>;
  return <>
    <section className="card hero">
      <div className="hero-icon">✓</div><h2>Cross-check dokumen EXIM</h2>
      <p className="muted hero-copy">Upload dokumen Excel. Sistem mengenali jenis dokumen, membaca struktur file, lalu membandingkan data langsung di browser.</p>
      <label className={'drop '+(drag?'dragging':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={onDrop}>
        <input type="file" accept=".xlsx,.xls,.xlsm" multiple onChange={e=>addFiles(e.target.files)}/>
        <strong>Tarik & lepas file Excel di sini</strong><span>atau klik untuk memilih file</span><small>Invoice · Packing List · Surat Jalan · Draft CEISA</small>
      </label>
      {files.length>0&&<div className="file-list">{files.map(f=><div className="file-row" key={f.name+f.size}><span className="file-type">XLS</span><div><b>{f.name}</b><small>{formatBytes(f.size)}</small></div><button onClick={()=>remove(f.name)} aria-label="Remove">×</button></div>)}</div>}
      <button className="primary wide" disabled={!files.length||busy} onClick={submit}>{busy?<><span className="spinner"/> MEMERIKSA DOKUMEN...</>:'CHECK DATA'}</button>
      {error&&<div className="error">⚠ {error}</div>}
    </section>
    <section className="privacy card"><div className="privacy-icon">⌁</div><div><b>Privasi data</b><p>File Excel diproses langsung oleh browser kamu dan tidak di-upload ke server. History dan Customer Master tersimpan lokal di browser.</p></div></section>
  </>
}
function formatBytes(n){if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(0)} KB`;return `${(n/1024/1024).toFixed(1)} MB`}

function Result({data,onNew}){
  const r=data.result; const matched=r.overall_status==='MATCH';
  const docs=Object.entries(data.detected_documents||{});
  return <section className="card result">
    <div className={'overall '+(matched?'ok':'bad')}><div className="overall-symbol">{matched?'✓':'!'}</div><div><b>{matched?'DATA MATCH':'DATA NOT MATCH'}</b><span>{matched?'Seluruh field wajib sesuai.':'Terdapat field yang perlu diperiksa kembali.'}</span></div></div>
    <div className="summary-grid"><Info k="Customer" v={data.customer}/><Info k="Invoice" v={data.invoice.invoice_no}/><Info k="Packing List" v={data.packing_list.packing_list_no}/><Info k="Surat Jalan" v={data.surat_jalan?.surat_jalan||data.invoice.surat_jalan}/><Info k="Item Count" v={r.items.length}/></div>
    {docs.length>0&&<div className="detected"><b>Dokumen terdeteksi</b>{docs.map(([i,d])=><span key={i} className="doc-chip">{docLabels[d.type]||d.type}<small>{d.sheet}</small></span>)}</div>}
    <h2>Validation Summary</h2><table className="checks"><tbody>{Object.entries(r.checks).map(([k,v])=><tr key={k}><td>{labels[k]||k}</td><td><span className={'status '+(v==='MATCH'?'match':'mismatch')}>{v}</span></td></tr>)}</tbody></table>
    {r.mismatches?.length>0&&<div className="notes mismatch-box"><h2>Yang perlu diperiksa</h2>{r.mismatches.map(k=><div key={k}>• {labels[k]||k}</div>)}</div>}
    <h2>Item Detail</h2><div className="table-wrap"><table className="items"><thead><tr><th>No</th><th>Invoice Code</th><th>PL Code</th><th>Draft Code</th><th>Invoice Name</th><th>PL Name</th><th>Draft Name</th><th>Qty Inv</th><th>Qty Draft</th></tr></thead><tbody>{r.items.map(x=><tr key={x.sequence}><td>{x.sequence}</td><Cell v={x.invoice_code} s={x.item_code_cell_status?.invoice||x.item_code_status}/><Cell v={x.pl_code} s={x.item_code_cell_status?.pl||x.item_code_status}/><Cell v={x.draft_code} s={x.item_code_cell_status?.draft||x.item_code_status}/><Cell v={x.invoice_name} s={x.item_name_cell_status?.invoice||x.item_name_status}/><Cell v={x.pl_name} s={x.item_name_cell_status?.pl||x.item_name_status}/><Cell v={x.draft_name} s={x.item_name_cell_status?.draft||x.item_name_status}/><Cell v={x.invoice_quantity} s={x.quantity_status}/><Cell v={x.draft_quantity} s={x.quantity_status}/></tr>)}</tbody></table></div>
    {r.notes?.length>0&&<div className="notes"><h2>Notes</h2>{r.notes.map(n=><div key={n}>• {n}</div>)}</div>}
    <div className="result-actions"><button className="secondary" onClick={onNew}>＋ New Validation</button></div>
  </section>
}
function Cell({v,s}){return <td className={s==='MATCH'?'cell-ok':'cell-bad'}>{v??'—'}</td>} function Info({k,v}){return <div className="info"><span>{k}</span><b>{v||'—'}</b></div>}

function History({onOpen}){const [rows,setRows]=useState([]),[err,setErr]=useState('');useEffect(()=>{listHistory().then(setRows).catch(e=>setErr(e.message))},[]);return <section className="card"><div className="section-head"><div><h2>Validation History</h2><p className="muted">Hasil tersimpan lokal di browser ini.</p></div><span className="count-badge">{rows.length} record</span></div>{err&&<div className="error">⚠ {err}</div>}{rows.length===0?<Empty text="Belum ada hasil validasi."/>:<div className="table-wrap"><table><thead><tr><th>Date</th><th>Customer</th><th>Invoice</th><th>Packing List</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(x=><tr key={x.session_id}><td>{new Date(x.created_at).toLocaleString('id-ID')}</td><td>{x.customer||'—'}</td><td>{x.invoice?.invoice_no||'—'}</td><td>{x.packing_list?.packing_list_no||'—'}</td><td><span className={'status '+(x.result?.overall_status==='MATCH'?'match':'mismatch')}>{x.result?.overall_status}</span></td><td><button className="link" onClick={async()=>onOpen(await getHistory(x.session_id))}>View</button></td></tr>)}</tbody></table></div>}</section>}
function Empty({text}){return <div className="empty">{text}</div>}

function Customers(){const [rows,setRows]=useState(getCustomers()),[edit,setEdit]=useState(null),[msg,setMsg]=useState('');const fresh=()=>setEdit({id:crypto.randomUUID(),customer_name:'',status:'ACTIVE',mappings:{invoice:{},packing_list:{},surat_jalan:{}},row_rule:{item_identifier:'ITEM NAME',aggregation_labels:'TOTAL;SUBTOTAL;GRAND TOTAL',continue_after_aggregation:true}});const save=draft=>{upsertCustomer(draft);setRows(getCustomers());setMsg('Customer tersimpan di browser ini.');setTimeout(()=>{setMsg('');setEdit(null)},500)};return <section className="card"><div className="section-head"><div><h2>Customer Master</h2><p className="muted">Aturan mapping dokumen disimpan lokal di browser.</p></div><button className="primary" onClick={fresh}>＋ Add Customer</button></div>{msg&&<div className="notice">✓ {msg}</div>}<table><thead><tr><th>Customer</th><th>Status</th><th>Mapping</th><th>Action</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><b>{x.customer_name}</b></td><td><span className="status match">{x.status}</span></td><td>Configured</td><td><button className="link" onClick={()=>setEdit(structuredClone(x))}>Edit</button></td></tr>)}</tbody></table>{edit&&<CustomerEditor data={edit} close={()=>setEdit(null)} save={save}/>}</section>}
function CustomerEditor({data,close,save}){const [d,setD]=useState(data);const setMap=(doc,key,part,val)=>setD({...d,mappings:{...d.mappings,[doc]:{...d.mappings[doc],[key]:{...(d.mappings?.[doc]?.[key]||{}),[part]:val.split(';').map(x=>x.trim()).filter(Boolean)}}}});const get=(doc,key,part)=>part==='primary'?(d.mappings?.[doc]?.[key]?.primary||''):(d.mappings?.[doc]?.[key]?.alternatives||[]).join('; ');const fields=[['invoice','INVOICE_NUMBER'],['invoice','ITEM_CODE'],['invoice','ITEM_NAME'],['invoice','QUANTITY'],['invoice','AMOUNT'],['invoice','SURAT_JALAN'],['packing_list','PACKING_LIST_NO'],['packing_list','ITEM_CODE'],['packing_list','ITEM_NAME'],['packing_list','QUANTITY'],['packing_list','GROSS_WEIGHT'],['packing_list','NET_WEIGHT'],['packing_list','PACKAGE'],['surat_jalan','ITEM_CODE'],['surat_jalan','ITEM_NAME'],['surat_jalan','QUANTITY']];return <div className="modal-back"><div className="modal"><h2>{data.customer_name?'Edit Customer':'Add Customer'}</h2><label>Customer Name<input value={d.customer_name} onChange={e=>setD({...d,customer_name:e.target.value})}/></label><label>Status<select value={d.status} onChange={e=>setD({...d,status:e.target.value})}><option>ACTIVE</option><option>INACTIVE</option></select></label><h3>Field Mapping</h3><p className="muted">Primary = header utama. Alternative = header lama/varian, pisahkan dengan ;</p><div className="mapping-grid">{fields.map(([doc,key])=><div className="mapping-field" key={doc+key}><small>{doc} · {key}</small><input placeholder="Primary header" value={get(doc,key,'primary')} onChange={e=>setD({...d,mappings:{...d.mappings,[doc]:{...d.mappings[doc],[key]:{...(d.mappings?.[doc]?.[key]||{}),primary:e.target.value}}}})}/><input placeholder="Alternative headers; header lama" value={get(doc,key,'alternatives')} onChange={e=>setMap(doc,key,'alternatives',e.target.value)}/></div>)}</div><h3>Packing List Row Rule</h3><label>Item Identifier<input value={d.row_rule?.item_identifier||''} onChange={e=>setD({...d,row_rule:{...d.row_rule,item_identifier:e.target.value}})}/></label><label>Aggregation Labels<input value={d.row_rule?.aggregation_labels||''} onChange={e=>setD({...d,row_rule:{...d.row_rule,aggregation_labels:e.target.value}})}/></label><label className="checkline"><input type="checkbox" checked={!!d.row_rule?.continue_after_aggregation} onChange={e=>setD({...d,row_rule:{...d.row_rule,continue_after_aggregation:e.target.checked}})}/> Continue after aggregation row</label><div className="actions"><button className="secondary" onClick={close}>Cancel</button><button className="primary" onClick={()=>save(d)}>Save</button></div></div></div>}
createRoot(document.getElementById('root')).render(<App/>);
