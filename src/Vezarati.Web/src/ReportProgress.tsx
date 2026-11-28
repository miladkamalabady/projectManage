export function reportProgress(completed:number,total:number) {
  const safeTotal=Math.max(0,total);
  const done=Math.min(safeTotal,Math.max(0,completed));
  const percent=safeTotal?Math.round(done*100/safeTotal):0;
  return {percent,remaining:safeTotal?100-percent:0,total:safeTotal};
}
export default function ReportProgress({completed,total,kind="reports"}:{completed:number;total:number;kind?:"reports"|"tasks"|"people"}) {
  const value=reportProgress(completed,total);
  const title=kind==="tasks"?"درصد وظایف انجام‌شده از کل وظایف فرد در محدوده فیلترهای انتخاب‌شده":kind==="people"?"درصد افراد انجام‌دهنده از کل افراد ارجاع‌شده":"درصد افراد دارای حداقل یک گزارش از کل افراد ارجاع‌شده؛ گزارش تکراری دوباره شمرده نمی‌شود.";
  return <span className="report-mini-progress" title={title}>{value.total?<><span className="report-mini-progress-labels"><span>{value.percent}٪ تکمیل</span><span>{value.remaining}٪ باقی‌مانده</span></span><span className="report-mini-progress-track" role="progressbar" aria-label={kind==="reports"?"میزان ارسال گزارش افراد ارجاع‌شده":"میزان تکمیل و باقی‌مانده"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value.percent} aria-valuetext={`${value.percent} درصد تکمیل، ${value.remaining} درصد باقی‌مانده`}><span style={{width:`${value.percent}%`}}/></span></>:<small>{kind==="tasks"?"بدون وظیفه":"بدون فرد ارجاع‌شده"}</small>}</span>;
}
