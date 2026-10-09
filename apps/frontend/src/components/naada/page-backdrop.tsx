/**
 * The warm gradient and blurred photos fixed behind a page, which the frosted
 * glass panels sit on. Render it once inside an element that is `isolate`d.
 */
export function PageBackdrop() {
  return (
    <div className="page-backdrop" aria-hidden>
      <img src="/media/events/crowd-under-stage-lights.jpg" alt="" className="-left-[20vmax] -top-[24vmax]" />
      <img src="/media/events/classical-dancer-stage.jpg" alt="" className="-bottom-[28vmax] -right-[22vmax]" />
    </div>
  );
}
