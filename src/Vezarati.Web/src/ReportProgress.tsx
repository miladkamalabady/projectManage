export function reportProgress(completed:number,total:number) {
  const safeTotal=Math.max(0,total);
  const done=Math.min(safeTotal,Math.max(0,completed));
  const percent=safeTotal?Math.round(done*100/safeTotal):0;
  return {percent,remaining:safeTotal?100-percent:0,total:safeTotal};
}
export default function ReportProgress({completed,total}:{completed:number;total:number}) {
  const value=reportProgress(completed,total);
  return <span className="report-mini-progress" title="درصد افراد دارای حداقل یک گزارش از کل افراد ارجاع‌شده؛ گزارش تکراری دوباره شمرده نمی‌شود.">{value.total?<><span className="report-mini-progress-labels"><span>{value.percent}٪ تکمیل</span><span>{value.remaining}٪ باقی‌مانده</span></span><span className="report-mini-progress-track" role="progressbar" aria-label="میزان ارسال گزارش افراد ارجاع‌شده" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent} aria-valuetext={`${value.percent} درصد تکمیل، ${value.remaining} درصد باقی‌مانده`}><span style={{width:`${value.percent}%`}}/></span></>:<small>بدون فرد ارجاع‌شده</small>}</span>;
}
