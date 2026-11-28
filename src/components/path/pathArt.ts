// Decorative SVG markup ported verbatim from the locked TM2 Path home mock
// (handoff 2026-11-27, dark PC home round 15: ORN_FRAME, ORN, PATH_SVG, ICONS).
// Generated once from the mock; class names gain the repo's `tm-` prefix.
// Static, trusted, aria-hidden decoration only — never interpolate user data here.
import type { AppToolId } from "../../config/toolNavigation";

/** Fixed-size corner brackets, mid-side claws, inset hairline and tick rails for a section card. */
export const CHAMBER_FRAME_MARKUP = `<span class="tm-ch-inset"></span>
<span class="tm-ch-corner tl"><svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<path d="M1.5 13.5 L1.5 6.5 Q1.5 1.5 6.5 1.5 H13.5" stroke="rgba(238,244,255,.58)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 6 H13.5 M6 6 V13.5" stroke="rgba(197,184,255,.38)" stroke-width=".8" stroke-linecap="round"/>
<rect x="1" y="1" width="2.6" height="2.6" fill="rgba(238,244,255,.58)"/>
</svg></span>
<span class="tm-ch-corner tr"><svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<path d="M1.5 13.5 L1.5 6.5 Q1.5 1.5 6.5 1.5 H13.5" stroke="rgba(238,244,255,.58)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 6 H13.5 M6 6 V13.5" stroke="rgba(197,184,255,.38)" stroke-width=".8" stroke-linecap="round"/>
<rect x="1" y="1" width="2.6" height="2.6" fill="rgba(238,244,255,.58)"/>
</svg></span>
<span class="tm-ch-corner bl"><svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<path d="M1.5 13.5 L1.5 6.5 Q1.5 1.5 6.5 1.5 H13.5" stroke="rgba(238,244,255,.58)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 6 H13.5 M6 6 V13.5" stroke="rgba(197,184,255,.38)" stroke-width=".8" stroke-linecap="round"/>
<rect x="1" y="1" width="2.6" height="2.6" fill="rgba(238,244,255,.58)"/>
</svg></span>
<span class="tm-ch-corner br"><svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<path d="M1.5 13.5 L1.5 6.5 Q1.5 1.5 6.5 1.5 H13.5" stroke="rgba(238,244,255,.58)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
<path d="M6 6 H13.5 M6 6 V13.5" stroke="rgba(197,184,255,.38)" stroke-width=".8" stroke-linecap="round"/>
<rect x="1" y="1" width="2.6" height="2.6" fill="rgba(238,244,255,.58)"/>
</svg></span>
<span class="tm-ch-claw west"><svg viewBox="0 0 10 14" fill="none" aria-hidden="true">
<path d="M1.2 4.2 H2.2 L5 7 L2.2 9.8 H1.2" stroke="rgba(238,244,255,.42)" stroke-width="0.9" stroke-linejoin="round"/>
</svg></span>
<span class="tm-ch-claw east"><svg viewBox="0 0 10 14" fill="none" aria-hidden="true">
<path d="M1.2 4.2 H2.2 L5 7 L2.2 9.8 H1.2" stroke="rgba(238,244,255,.42)" stroke-width="0.9" stroke-linejoin="round"/>
</svg></span>
<span class="tm-ch-ticks top"><svg viewBox="0 0 100 7" preserveAspectRatio="none" fill="none" aria-hidden="true"><line x1="0.00" y1="0.4" x2="0.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="6.25" y1="0.4" x2="6.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="12.50" y1="0.4" x2="12.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="18.75" y1="0.4" x2="18.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="25.00" y1="0.4" x2="25.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="31.25" y1="0.4" x2="31.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="37.50" y1="0.4" x2="37.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="43.75" y1="0.4" x2="43.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="50.00" y1="0.4" x2="50.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="56.25" y1="0.4" x2="56.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="62.50" y1="0.4" x2="62.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="68.75" y1="0.4" x2="68.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="75.00" y1="0.4" x2="75.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="81.25" y1="0.4" x2="81.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="87.50" y1="0.4" x2="87.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="93.75" y1="0.4" x2="93.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="100.00" y1="0.4" x2="100.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/></svg></span>
<span class="tm-ch-ticks bot"><svg viewBox="0 0 100 7" preserveAspectRatio="none" fill="none" aria-hidden="true"><line x1="0.00" y1="0.4" x2="0.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="6.25" y1="0.4" x2="6.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="12.50" y1="0.4" x2="12.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="18.75" y1="0.4" x2="18.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="25.00" y1="0.4" x2="25.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="31.25" y1="0.4" x2="31.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="37.50" y1="0.4" x2="37.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="43.75" y1="0.4" x2="43.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="50.00" y1="0.4" x2="50.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="56.25" y1="0.4" x2="56.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="62.50" y1="0.4" x2="62.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="68.75" y1="0.4" x2="68.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="75.00" y1="0.4" x2="75.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="81.25" y1="0.4" x2="81.25" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="87.50" y1="0.4" x2="87.50" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="93.75" y1="0.4" x2="93.75" y2="3.4" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/><line x1="100.00" y1="0.4" x2="100.00" y2="5.5" stroke="rgba(238,244,255,.26)" stroke-width="0.7"/></svg></span>`;

/** Per-section emblem watermark (Design dial, Gamesheets atlas, Pack archive). */
export const CHAMBER_EMBLEM_MARKUP = {
  design: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 520' fill='none' aria-hidden='true'>
<circle cx="508" cy="232" r="198" stroke="rgba(238,244,255,.16)" stroke-width="0.7"/>
<circle cx="508" cy="232" r="178" stroke="rgba(197,184,255,.2)" stroke-width="0.7" stroke-dasharray="2 6"/>
<line x1="380" y1="80" x2="410" y2="70" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<line x1="410" y1="70" x2="440" y2="88" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<line x1="440" y1="88" x2="428" y2="114" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<line x1="370" y1="100" x2="380" y2="80" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<line x1="370" y1="100" x2="400" y2="120" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<circle cx="380" cy="80" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="410" cy="70" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="440" cy="88" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="428" cy="114" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="370" cy="100" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="400" cy="120" r="1.2" fill="rgba(238,244,255,.55)"/>
<circle cx="508" cy="232" r="162" stroke="rgba(238,244,255,.42)" stroke-width="1.15"/>
<circle cx="508" cy="232" r="148" stroke="rgba(238,244,255,.22)" stroke-width="0.8"/>
<circle cx="508" cy="232" r="126" stroke="currentColor" stroke-width="1.05" opacity=".7"/>
<circle cx="508" cy="232" r="104" stroke="rgba(238,244,255,.42)" stroke-width="0.9"/>
<circle cx="508" cy="232" r="78" stroke="rgba(238,244,255,.22)" stroke-width="0.8"/>
<circle cx="508" cy="232" r="52" fill="rgba(10,16,36,.28)" stroke="rgba(238,244,255,.42)" stroke-width="0.85"/>
<line x1="508.00" y1="70.00" x2="508.00" y2="54.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="522.12" y1="70.62" x2="522.82" y2="62.65" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="536.13" y1="72.46" x2="537.52" y2="64.58" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="549.93" y1="75.52" x2="552.00" y2="67.79" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="563.41" y1="79.77" x2="566.14" y2="72.25" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="576.46" y1="85.18" x2="579.85" y2="77.93" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="589.00" y1="91.70" x2="597.00" y2="77.85" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="600.92" y1="99.30" x2="605.51" y2="92.74" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="612.13" y1="107.90" x2="617.27" y2="101.77" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="622.55" y1="117.45" x2="628.21" y2="111.79" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="632.10" y1="127.87" x2="638.23" y2="122.73" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="640.70" y1="139.08" x2="647.26" y2="134.49" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="648.30" y1="151.00" x2="662.15" y2="143.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="654.82" y1="163.54" x2="662.07" y2="160.15" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="660.23" y1="176.59" x2="667.75" y2="173.86" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="664.48" y1="190.07" x2="672.21" y2="188.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="667.54" y1="203.87" x2="675.42" y2="202.48" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="669.38" y1="217.88" x2="677.35" y2="217.18" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="670.00" y1="232.00" x2="686.00" y2="232.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="669.38" y1="246.12" x2="677.35" y2="246.82" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="667.54" y1="260.13" x2="675.42" y2="261.52" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="664.48" y1="273.93" x2="672.21" y2="276.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="660.23" y1="287.41" x2="667.75" y2="290.14" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="654.82" y1="300.46" x2="662.07" y2="303.85" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="648.30" y1="313.00" x2="662.15" y2="321.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="640.70" y1="324.92" x2="647.26" y2="329.51" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="632.10" y1="336.13" x2="638.23" y2="341.27" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="622.55" y1="346.55" x2="628.21" y2="352.21" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="612.13" y1="356.10" x2="617.27" y2="362.23" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="600.92" y1="364.70" x2="605.51" y2="371.26" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="589.00" y1="372.30" x2="597.00" y2="386.15" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="576.46" y1="378.82" x2="579.85" y2="386.07" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="563.41" y1="384.23" x2="566.14" y2="391.75" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="549.93" y1="388.48" x2="552.00" y2="396.21" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="536.13" y1="391.54" x2="537.52" y2="399.42" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="522.12" y1="393.38" x2="522.82" y2="401.35" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="508.00" y1="394.00" x2="508.00" y2="410.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="493.88" y1="393.38" x2="493.18" y2="401.35" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="479.87" y1="391.54" x2="478.48" y2="399.42" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="466.07" y1="388.48" x2="464.00" y2="396.21" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="452.59" y1="384.23" x2="449.86" y2="391.75" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="439.54" y1="378.82" x2="436.15" y2="386.07" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="427.00" y1="372.30" x2="419.00" y2="386.15" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="415.08" y1="364.70" x2="410.49" y2="371.26" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="403.87" y1="356.10" x2="398.73" y2="362.23" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="393.45" y1="346.55" x2="387.79" y2="352.21" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="383.90" y1="336.13" x2="377.77" y2="341.27" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="375.30" y1="324.92" x2="368.74" y2="329.51" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="367.70" y1="313.00" x2="353.85" y2="321.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="361.18" y1="300.46" x2="353.93" y2="303.85" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="355.77" y1="287.41" x2="348.25" y2="290.14" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="351.52" y1="273.93" x2="343.79" y2="276.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="348.46" y1="260.13" x2="340.58" y2="261.52" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="346.62" y1="246.12" x2="338.65" y2="246.82" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="346.00" y1="232.00" x2="330.00" y2="232.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="346.62" y1="217.88" x2="338.65" y2="217.18" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="348.46" y1="203.87" x2="340.58" y2="202.48" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="351.52" y1="190.07" x2="343.79" y2="188.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="355.77" y1="176.59" x2="348.25" y2="173.86" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="361.18" y1="163.54" x2="353.93" y2="160.15" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="367.70" y1="151.00" x2="353.85" y2="143.00" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="375.30" y1="139.08" x2="368.74" y2="134.49" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="383.90" y1="127.87" x2="377.77" y2="122.73" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="393.45" y1="117.45" x2="387.79" y2="111.79" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="403.87" y1="107.90" x2="398.73" y2="101.77" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="415.08" y1="99.30" x2="410.49" y2="92.74" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="427.00" y1="91.70" x2="419.00" y2="77.85" stroke="rgba(238,244,255,.55)" stroke-width="1.2"/>
<line x1="439.54" y1="85.18" x2="436.15" y2="77.93" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="452.59" y1="79.77" x2="449.86" y2="72.25" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="466.07" y1="75.52" x2="464.00" y2="67.79" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="479.87" y1="72.46" x2="478.48" y2="64.58" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="493.88" y1="70.62" x2="493.18" y2="62.65" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="508.00" y1="106.00" x2="508.00" y2="92.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="540.61" y1="110.29" x2="542.68" y2="102.57" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="571.00" y1="122.88" x2="578.00" y2="110.76" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="597.10" y1="142.90" x2="602.75" y2="137.25" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="617.12" y1="169.00" x2="629.24" y2="162.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="629.71" y1="199.39" x2="637.43" y2="197.32" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="634.00" y1="232.00" x2="648.00" y2="232.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="629.71" y1="264.61" x2="637.43" y2="266.68" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="617.12" y1="295.00" x2="629.24" y2="302.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="597.10" y1="321.10" x2="602.75" y2="326.75" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="571.00" y1="341.12" x2="578.00" y2="353.24" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="540.61" y1="353.71" x2="542.68" y2="361.43" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="508.00" y1="358.00" x2="508.00" y2="372.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="475.39" y1="353.71" x2="473.32" y2="361.43" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="445.00" y1="341.12" x2="438.00" y2="353.24" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="418.90" y1="321.10" x2="413.25" y2="326.75" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="398.88" y1="295.00" x2="386.76" y2="302.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="386.29" y1="264.61" x2="378.57" y2="266.68" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="382.00" y1="232.00" x2="368.00" y2="232.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="386.29" y1="199.39" x2="378.57" y2="197.32" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="398.88" y1="169.00" x2="386.76" y2="162.00" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="418.90" y1="142.90" x2="413.25" y2="137.25" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="445.00" y1="122.88" x2="438.00" y2="110.76" stroke="rgba(238,244,255,.55)" stroke-width="1.0"/>
<line x1="475.39" y1="110.29" x2="473.32" y2="102.57" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="508.00" y1="154.00" x2="508.00" y2="106.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="547.00" y1="164.45" x2="571.00" y2="122.88" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="575.55" y1="193.00" x2="617.12" y2="169.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="586.00" y1="232.00" x2="634.00" y2="232.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="575.55" y1="271.00" x2="617.12" y2="295.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="547.00" y1="299.55" x2="571.00" y2="341.12" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="508.00" y1="310.00" x2="508.00" y2="358.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="469.00" y1="299.55" x2="445.00" y2="341.12" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="440.45" y1="271.00" x2="398.88" y2="295.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="430.00" y1="232.00" x2="382.00" y2="232.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="440.45" y1="193.00" x2="398.88" y2="169.00" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="469.00" y1="164.45" x2="445.00" y2="122.88" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<path d="M508.00 106.00 A126 126 0 0 1 631.77 255.61" stroke="currentColor" stroke-width="2.2" opacity=".85" stroke-linecap="round"/>
<path d="M582.00 360.17 A148 148 0 0 1 360.00 232.00" stroke="rgba(197,184,255,.34)" stroke-width="1.1" stroke-linecap="round"/>
<text x="508.00" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">0</text>
<text x="508.00" y="32.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">R</text>
<text x="602.00" y="69.19" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">30</text>
<text x="670.81" y="138.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">60</text>
<text x="681.21" y="132.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">Y</text>
<text x="696.00" y="232.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">90</text>
<text x="670.81" y="326.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">120</text>
<text x="681.21" y="332.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">G</text>
<text x="602.00" y="394.81" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">150</text>
<text x="508.00" y="420.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">180</text>
<text x="508.00" y="432.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">C</text>
<text x="414.00" y="394.81" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">210</text>
<text x="345.19" y="326.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">240</text>
<text x="334.79" y="332.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">B</text>
<text x="320.00" y="232.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">270</text>
<text x="345.19" y="138.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">300</text>
<text x="334.79" y="132.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="600" letter-spacing=".1em">M</text>
<text x="414.00" y="69.19" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="500" letter-spacing=".08em">330</text>
<text x="508.00" y="142.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.6" font-weight="500" letter-spacing=".14em">HUE</text>
<text x="600.00" y="240.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".12em">SAT</text>
<text x="508.00" y="324.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".12em">PART</text>
<text x="416.00" y="240.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".12em">GLOW</text>
<rect x="480" y="204" width="56" height="56" stroke="rgba(238,244,255,.55)" stroke-width="0.9" stroke-dasharray="3 2.5"/>
<rect x="477.8" y="201.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="533.8" y="201.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="477.8" y="257.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="533.8" y="257.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="505.8" y="201.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="505.8" y="257.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="477.8" y="229.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<rect x="533.8" y="229.8" width="4.4" height="4.4" fill="rgba(7,10,23,.7)" stroke="rgba(238,244,255,.55)" stroke-width="0.7"/>
<path d="M508 216 L521 230 L508 248 L495 230 Z" stroke="rgba(238,244,255,.55)" stroke-width="1.15" stroke-linejoin="round"/>
<path d="M495 230 L521 230 M508 216 L508 248" stroke="rgba(197,184,255,.34)" stroke-width="0.7"/>
<path d="M508 186 V196 M508 268 V278 M462 232 H472 M544 232 H554" stroke="rgba(238,244,255,.42)" stroke-width="0.8" stroke-linecap="round"/>
<path d="M465.0 18 L551.0 18 L556.0 23 L556.0 32 L460.0 32 L460.0 23 Z" fill="rgba(7,10,23,.45)" stroke="rgba(238,244,255,.42)" stroke-width="0.9"/><text x="508.00" y="25.30" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.55)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="600" letter-spacing=".14em">01  ICON</text>
<g transform="translate(382.1 106.1) rotate(135)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(633.9 106.1) rotate(225)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(633.9 106.1) rotate(45)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(633.9 357.9) rotate(135)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<path d="M508.0 66.8 L511.2 70.0 L508.0 73.2 L504.8 70.0 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M670.0 228.8 L673.2 232.0 L670.0 235.2 L666.8 232.0 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M508.0 390.8 L511.2 394.0 L508.0 397.2 L504.8 394.0 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M346.0 228.80000000000004 L349.2 232.00000000000003 L346.0 235.20000000000002 L342.8 232.00000000000003 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
</svg>`,
  sheets: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 680 340' fill='none' aria-hidden='true'>
<line x1="0" y1="0" x2="0" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="20" y1="0" x2="20" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="40" y1="0" x2="40" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="60" y1="0" x2="60" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="80" y1="0" x2="80" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="100" y1="0" x2="100" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="120" y1="0" x2="120" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="140" y1="0" x2="140" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="160" y1="0" x2="160" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="180" y1="0" x2="180" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="200" y1="0" x2="200" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="220" y1="0" x2="220" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="240" y1="0" x2="240" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="260" y1="0" x2="260" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="280" y1="0" x2="280" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="300" y1="0" x2="300" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="320" y1="0" x2="320" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="340" y1="0" x2="340" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="360" y1="0" x2="360" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="380" y1="0" x2="380" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="400" y1="0" x2="400" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="420" y1="0" x2="420" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="440" y1="0" x2="440" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="460" y1="0" x2="460" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="480" y1="0" x2="480" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="500" y1="0" x2="500" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="520" y1="0" x2="520" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="540" y1="0" x2="540" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="560" y1="0" x2="560" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="580" y1="0" x2="580" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="600" y1="0" x2="600" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="620" y1="0" x2="620" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="640" y1="0" x2="640" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="660" y1="0" x2="660" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="680" y1="0" x2="680" y2="210" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="0" x2="680" y2="0" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="20" x2="680" y2="20" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="40" x2="680" y2="40" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="60" x2="680" y2="60" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="80" x2="680" y2="80" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="100" x2="680" y2="100" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="120" x2="680" y2="120" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="140" x2="680" y2="140" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="160" x2="680" y2="160" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="180" x2="680" y2="180" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<line x1="0" y1="200" x2="680" y2="200" stroke="rgba(238,244,255,.10)" stroke-width="0.5"/>
<path d="M80 28 A 70 70 0 0 0 40 68" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<path d="M600 28 A 70 70 0 0 1 640 68" stroke="rgba(197,184,255,.2)" stroke-width="0.7"/>
<rect x="118" y="28" width="444" height="184" stroke="rgba(238,244,255,.22)" stroke-width="0.7" rx="3"/>
<path d="M294.0 8 L386.0 8 L391.0 13 L391.0 22 L289.0 22 L289.0 13 Z" fill="rgba(7,10,23,.45)" stroke="rgba(238,244,255,.42)" stroke-width="0.9"/><text x="340.00" y="15.30" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.55)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="600" letter-spacing=".14em">02  ATLAS</text>
<rect x="128" y="36" width="424" height="160" fill="rgba(10,16,36,.22)" stroke="rgba(238,244,255,.42)" stroke-width="1.1"/>
<line x1="156.00" y1="52.00" x2="156.00" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="204.25" y1="52.00" x2="204.25" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="252.50" y1="52.00" x2="252.50" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="300.75" y1="52.00" x2="300.75" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="349.00" y1="52.00" x2="349.00" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="397.25" y1="52.00" x2="397.25" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="445.50" y1="52.00" x2="445.50" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="493.75" y1="52.00" x2="493.75" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="542.00" y1="52.00" x2="542.00" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="156.00" y1="52.00" x2="542.00" y2="52.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="156.00" y1="84.50" x2="542.00" y2="84.50" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="156.00" y1="117.00" x2="542.00" y2="117.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="156.00" y1="149.50" x2="542.00" y2="149.50" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="156.00" y1="182.00" x2="542.00" y2="182.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<text x="180.12" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">00</text>
<text x="228.38" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">16</text>
<text x="276.62" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">32</text>
<text x="324.88" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">48</text>
<text x="373.12" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">64</text>
<text x="421.38" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">80</text>
<text x="469.62" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">96</text>
<text x="517.88" y="44.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">112</text>
<text x="144.00" y="68.25" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">00</text>
<text x="144.00" y="100.75" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">16</text>
<text x="144.00" y="133.25" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">32</text>
<text x="144.00" y="165.75" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".08em">48</text>
<rect x="252.50" y="84.50" width="48.25" height="32.50" fill="none" stroke="currentColor" stroke-width="1.6"/>
<path d="M276.6 92.8 L283.6 100.8 L276.6 108.8 L269.6 100.8 Z" stroke="currentColor" stroke-width="1" opacity=".9" stroke-linejoin="round"/>
<rect x="413.4" y="127.2" width="16" height="12" rx="1.5" stroke="rgba(238,244,255,.55)" stroke-width="0.8"/>
<circle cx="421.4" cy="132.2" r="2" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<path d="M174.1 165.8 H186.1 M180.1 159.8 V171.8" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<rect x="495.75" y="54.00" width="44.25" height="28.50" stroke="rgba(197,184,255,.34)" stroke-width="0.7" stroke-dasharray="2 2"/>
<line x1="156.00" y1="36" x2="156.00" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="156.00" y1="196" x2="156.00" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="204.25" y1="36" x2="204.25" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="204.25" y1="196" x2="204.25" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="252.50" y1="36" x2="252.50" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="252.50" y1="196" x2="252.50" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="300.75" y1="36" x2="300.75" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="300.75" y1="196" x2="300.75" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="349.00" y1="36" x2="349.00" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="349.00" y1="196" x2="349.00" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="397.25" y1="36" x2="397.25" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="397.25" y1="196" x2="397.25" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="445.50" y1="36" x2="445.50" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="445.50" y1="196" x2="445.50" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="493.75" y1="36" x2="493.75" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="493.75" y1="196" x2="493.75" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="542.00" y1="36" x2="542.00" y2="32" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<line x1="542.00" y1="196" x2="542.00" y2="200" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<text x="588.00" y="52.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.6" font-weight="500" letter-spacing=".08em">256</text>
<text x="588.00" y="64.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.6" font-weight="500" letter-spacing=".08em">× 160</text>
<text x="588.00" y="84.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="500" letter-spacing=".14em">CELL</text>
<text x="588.00" y="96.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="500" letter-spacing=".1em">16 PX</text>
<text x="588.00" y="120.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="600" letter-spacing=".14em">UV</text>
<text x="588.00" y="140.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="500" letter-spacing=".08em">0.00</text>
<text x="0" y="0" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".16em" transform="translate(100 116.0) rotate(-90)">SHEET</text>
<g transform="translate(118.0 116.0) rotate(-90)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(562.0 116.0) rotate(90)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<path d="M128 33 L131 36 L128 39 L125 36 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M552 33 L555 36 L552 39 L549 36 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M128 193 L131 196 L128 199 L125 196 Z" fill="none" stroke="rgba(238,244,255,.55)" stroke-width="0.9"/>
<path d="M552 193 L555 196 L552 199 L549 196 Z" fill="none" stroke="rgba(238,244,255,.55)" stroke-width="0.9"/>
</svg>`,
  packs: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 680 300' fill='none' aria-hidden='true'>
<circle cx="300" cy="124" r="128" stroke="rgba(238,244,255,.16)" stroke-width="0.7"/>
<circle cx="300" cy="124" r="114" stroke="rgba(197,184,255,.2)" stroke-width="0.7" stroke-dasharray="2 5"/>
<circle cx="293" cy="132" r="96" stroke="rgba(238,244,255,.22)" stroke-width="1" opacity="0.35"/>
<circle cx="296.5" cy="128" r="96" stroke="rgba(238,244,255,.22)" stroke-width="1" opacity="0.55"/>
<circle cx="300" cy="124" r="96" stroke="rgba(238,244,255,.42)" stroke-width="1.15"/>
<circle cx="300" cy="124" r="78" stroke="currentColor" stroke-width="1.05" opacity=".75"/>
<circle cx="300" cy="124" r="60" stroke="rgba(238,244,255,.42)" stroke-width="0.9"/>
<circle cx="300" cy="124" r="42" fill="rgba(10,16,36,.3)" stroke="rgba(238,244,255,.22)" stroke-width="0.8"/>
<line x1="300.00" y1="28.00" x2="300.00" y2="14.00" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="312.53" y1="28.82" x2="313.57" y2="20.89" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="324.85" y1="31.27" x2="326.92" y2="23.54" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="336.74" y1="35.31" x2="339.80" y2="27.92" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="348.00" y1="40.86" x2="352.00" y2="33.93" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="358.44" y1="47.84" x2="363.31" y2="41.49" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="367.88" y1="56.12" x2="377.78" y2="46.22" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="376.16" y1="65.56" x2="382.51" y2="60.69" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="383.14" y1="76.00" x2="390.07" y2="72.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="388.69" y1="87.26" x2="396.08" y2="84.20" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="392.73" y1="99.15" x2="400.46" y2="97.08" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="395.18" y1="111.47" x2="403.11" y2="110.43" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="396.00" y1="124.00" x2="410.00" y2="124.00" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="395.18" y1="136.53" x2="403.11" y2="137.57" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="392.73" y1="148.85" x2="400.46" y2="150.92" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="388.69" y1="160.74" x2="396.08" y2="163.80" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="383.14" y1="172.00" x2="390.07" y2="176.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="376.16" y1="182.44" x2="382.51" y2="187.31" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="367.88" y1="191.88" x2="377.78" y2="201.78" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="358.44" y1="200.16" x2="363.31" y2="206.51" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="348.00" y1="207.14" x2="352.00" y2="214.07" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="336.74" y1="212.69" x2="339.80" y2="220.08" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="324.85" y1="216.73" x2="326.92" y2="224.46" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="312.53" y1="219.18" x2="313.57" y2="227.11" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="300.00" y1="220.00" x2="300.00" y2="234.00" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="287.47" y1="219.18" x2="286.43" y2="227.11" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="275.15" y1="216.73" x2="273.08" y2="224.46" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="263.26" y1="212.69" x2="260.20" y2="220.08" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="252.00" y1="207.14" x2="248.00" y2="214.07" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="241.56" y1="200.16" x2="236.69" y2="206.51" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="232.12" y1="191.88" x2="222.22" y2="201.78" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="223.84" y1="182.44" x2="217.49" y2="187.31" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="216.86" y1="172.00" x2="209.93" y2="176.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="211.31" y1="160.74" x2="203.92" y2="163.80" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="207.27" y1="148.85" x2="199.54" y2="150.92" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="204.82" y1="136.53" x2="196.89" y2="137.57" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="204.00" y1="124.00" x2="190.00" y2="124.00" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="204.82" y1="111.47" x2="196.89" y2="110.43" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="207.27" y1="99.15" x2="199.54" y2="97.08" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="211.31" y1="87.26" x2="203.92" y2="84.20" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="216.86" y1="76.00" x2="209.93" y2="72.00" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="223.84" y1="65.56" x2="217.49" y2="60.69" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="232.12" y1="56.12" x2="222.22" y2="46.22" stroke="rgba(238,244,255,.55)" stroke-width="1.15"/>
<line x1="241.56" y1="47.84" x2="236.69" y2="41.49" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="252.00" y1="40.86" x2="248.00" y2="33.93" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="263.26" y1="35.31" x2="260.20" y2="27.92" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="275.15" y1="31.27" x2="273.08" y2="23.54" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<line x1="287.47" y1="28.82" x2="286.43" y2="20.89" stroke="rgba(238,244,255,.42)" stroke-width="0.7"/>
<path d="M300.00 46.00 A78 78 0 0 1 246.61 180.86" stroke="currentColor" stroke-width="2.1" opacity=".9" stroke-linecap="round"/>
<rect x="284" y="118" width="32" height="22" rx="1.5" stroke="rgba(238,244,255,.55)" stroke-width="1"/>
<path d="M284 118 L290 110 H306 L312 118" stroke="rgba(238,244,255,.55)" stroke-width="1" stroke-linejoin="round"/>
<path d="M288 110 L293 104 H307 L311 110" stroke="rgba(238,244,255,.42)" stroke-width="0.8" stroke-linejoin="round"/>
<path d="M300 122 V134 M295 130 L300 136 L305 130" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
<rect x="78" y="52" width="78" height="24" rx="3" stroke="rgba(238,244,255,.42)" stroke-width="0.8" opacity="0.75"/>
<text x="117.00" y="64.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="7" font-weight="500" letter-spacing=".06em">v 1.9</text>
<path d="M117 76 V82" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<rect x="78" y="82" width="78" height="24" rx="3" stroke="rgba(238,244,255,.42)" stroke-width="0.8" opacity="0.75"/>
<text x="117.00" y="94.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="7" font-weight="500" letter-spacing=".06em">v 2.1</text>
<path d="M117 106 V112" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<rect x="78" y="112" width="78" height="24" rx="3" stroke="currentColor" stroke-width="1.2" opacity="1"/>
<text x="117.00" y="124.00" text-anchor="middle" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="7" font-weight="600" letter-spacing=".06em">v 2.2</text>
<line x1="438" y1="40" x2="438" y2="210" stroke="rgba(238,244,255,.22)" stroke-width="0.8"/>
<line x1="431" y1="48" x2="445" y2="48" stroke="rgba(238,244,255,.42)" stroke-width="0.8"/>
<text x="456.00" y="48.00" text-anchor="start" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6.4" font-weight="500" letter-spacing=".06em">1.0</text>
<circle cx="438" cy="48" r="2" fill="rgba(238,244,255,.42)"/>
<line x1="431" y1="86" x2="445" y2="86" stroke="rgba(238,244,255,.42)" stroke-width="0.8"/>
<text x="456.00" y="86.00" text-anchor="start" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6.4" font-weight="500" letter-spacing=".06em">1.9</text>
<circle cx="438" cy="86" r="2" fill="rgba(238,244,255,.42)"/>
<line x1="431" y1="124" x2="445" y2="124" stroke="rgba(238,244,255,.42)" stroke-width="0.8"/>
<text x="456.00" y="124.00" text-anchor="start" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6.4" font-weight="500" letter-spacing=".06em">2.1</text>
<circle cx="438" cy="124" r="2" fill="rgba(238,244,255,.42)"/>
<line x1="431" y1="162" x2="445" y2="162" stroke="currentColor" stroke-width="1.2"/>
<text x="456.00" y="162.00" text-anchor="start" dominant-baseline="middle" fill="currentColor" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6.4" font-weight="600" letter-spacing=".06em">2.2</text>
<path d="M438 158.6 L441.4 162 L438 165.4 L434.6 162 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<circle cx="438" cy="162" r="8" stroke="currentColor" stroke-width="0.7" opacity=".5"/>
<line x1="431" y1="200" x2="445" y2="200" stroke="rgba(238,244,255,.42)" stroke-width="0.8"/>
<text x="456.00" y="200.00" text-anchor="start" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="6.4" font-weight="500" letter-spacing=".06em">2.3</text>
<circle cx="438" cy="200" r="2" fill="rgba(238,244,255,.42)"/>
<text x="438.00" y="26.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".16em">VER</text>
<text x="300.00" y="196.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.42)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.4" font-weight="500" letter-spacing=".14em">INSTALL</text>
<text x="222.00" y="116.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="500" letter-spacing=".12em">ARCHIVE</text>
<text x="378.00" y="116.00" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.22)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.2" font-weight="500" letter-spacing=".12em">GEODE</text>
<path d="M254.0 8 L346.0 8 L351.0 13 L351.0 22 L249.0 22 L249.0 13 Z" fill="rgba(7,10,23,.45)" stroke="rgba(238,244,255,.42)" stroke-width="0.9"/><text x="300.00" y="15.30" text-anchor="middle" dominant-baseline="middle" fill="rgba(238,244,255,.55)" font-family="IBM Plex Mono,ui-monospace,monospace" font-size="5.8" font-weight="600" letter-spacing=".14em">03  PACK</text>
<g transform="translate(201.3 67.0) rotate(30)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(398.7 67.0) rotate(-30)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<g transform="translate(300.0 238.0) rotate(180)"><path d="M-8 -4 L-8 -11 L0 -15 L8 -11 L8 -4" fill="none" stroke="rgba(238,244,255,.42)" stroke-width="1.05" stroke-linejoin="round" stroke-linecap="round"/><path d="M-3.5 0 L0 4.5 L3.5 0" fill="none" stroke="rgba(197,184,255,.34)" stroke-width=".8" stroke-linejoin="round"/></g>
<path d="M300.0 25.2 L302.8 28.0 L300.0 30.8 L297.2 28.0 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
<path d="M396.0 121.2 L398.8 124.0 L396.0 126.8 L393.2 124.0 Z" fill="none" stroke="rgba(238,244,255,.55)" stroke-width="0.9"/>
<path d="M300.0 217.2 L302.8 220.0 L300.0 222.8 L297.2 220.0 Z" fill="none" stroke="rgba(238,244,255,.55)" stroke-width="0.9"/>
<path d="M204.0 121.20000000000002 L206.8 124.00000000000001 L204.0 126.80000000000001 L201.2 124.00000000000001 Z" fill="none" stroke="rgba(238,244,255,.55)" stroke-width="0.9"/>
</svg>`,
} as const;

/** Decorated inter-card rail: double rail, ticks, diamonds, constellation, gear junction, terminus rings. */
export const PATH_RAIL_MARKUP = `<svg class="tm-path-stroke" viewBox="0 0 1000 600" preserveAspectRatio="none">
<path class="tm-path-glow" d="M200 500 H 480 V 294 H 920"/>
<path class="tm-path-bed" d="M200 500 H 480 V 294 H 920"/>
<path class="tm-path-rail" d="M200 497.6 H 477.6 V 291.6 H 920"/>
<path class="tm-path-rail" d="M200 502.4 H 482.4 V 296.4 H 920"/>
<path class="tm-path-rail-inner" d="M200 500 H 480 V 294 H 920"/>
<path class="tm-path-hair" d="M200 500 H 480 V 294 H 920"/>
<path class="tm-path-dash" d="M200 500 H 480 V 294 H 920"/>
<path class="tm-path-pulse" d="M200 500 H 480 V 294 H 920"/>
<line class="tm-path-tick" x1="240" y1="496.8" x2="240" y2="503.2"/><line class="tm-path-tick-long" x1="260" y1="494.8" x2="260" y2="505.2"/><line class="tm-path-tick" x1="280" y1="496.8" x2="280" y2="503.2"/><line class="tm-path-tick" x1="300" y1="496.8" x2="300" y2="503.2"/><line class="tm-path-tick-long" x1="320" y1="494.8" x2="320" y2="505.2"/><line class="tm-path-tick" x1="340" y1="496.8" x2="340" y2="503.2"/><line class="tm-path-tick" x1="360" y1="496.8" x2="360" y2="503.2"/><line class="tm-path-tick-long" x1="380" y1="494.8" x2="380" y2="505.2"/><line class="tm-path-tick" x1="400" y1="496.8" x2="400" y2="503.2"/><line class="tm-path-tick" x1="420" y1="496.8" x2="420" y2="503.2"/><line class="tm-path-tick-long" x1="440" y1="494.8" x2="440" y2="505.2"/><line class="tm-path-tick" x1="476.8" y1="460" x2="483.2" y2="460"/><line class="tm-path-tick-long" x1="474.8" y1="440" x2="485.2" y2="440"/><line class="tm-path-tick" x1="476.8" y1="420" x2="483.2" y2="420"/><line class="tm-path-tick" x1="476.8" y1="400" x2="483.2" y2="400"/><line class="tm-path-tick-long" x1="474.8" y1="380" x2="485.2" y2="380"/><line class="tm-path-tick" x1="476.8" y1="360" x2="483.2" y2="360"/><line class="tm-path-tick" x1="476.8" y1="340" x2="483.2" y2="340"/><line class="tm-path-tick" x1="520" y1="290.8" x2="520" y2="297.2"/><line class="tm-path-tick-long" x1="540" y1="288.8" x2="540" y2="299.2"/><line class="tm-path-tick" x1="560" y1="290.8" x2="560" y2="297.2"/><line class="tm-path-tick" x1="580" y1="290.8" x2="580" y2="297.2"/><line class="tm-path-tick-long" x1="600" y1="288.8" x2="600" y2="299.2"/><line class="tm-path-tick" x1="620" y1="290.8" x2="620" y2="297.2"/><line class="tm-path-tick" x1="640" y1="290.8" x2="640" y2="297.2"/><line class="tm-path-tick-long" x1="660" y1="288.8" x2="660" y2="299.2"/><line class="tm-path-tick" x1="680" y1="290.8" x2="680" y2="297.2"/><line class="tm-path-tick" x1="700" y1="290.8" x2="700" y2="297.2"/><line class="tm-path-tick-long" x1="720" y1="288.8" x2="720" y2="299.2"/><line class="tm-path-tick" x1="740" y1="290.8" x2="740" y2="297.2"/><line class="tm-path-tick" x1="760" y1="290.8" x2="760" y2="297.2"/><line class="tm-path-tick-long" x1="780" y1="288.8" x2="780" y2="299.2"/><line class="tm-path-tick" x1="800" y1="290.8" x2="800" y2="297.2"/><line class="tm-path-tick" x1="820" y1="290.8" x2="820" y2="297.2"/><line class="tm-path-tick-long" x1="840" y1="288.8" x2="840" y2="299.2"/><line class="tm-path-tick" x1="860" y1="290.8" x2="860" y2="297.2"/><line class="tm-path-tick" x1="880" y1="290.8" x2="880" y2="297.2"/>
<path d="M340 500 l3.2 -3.2 l3.2 3.2 l-3.2 3.2 z" fill="none" stroke="rgba(238,244,255,.4)" stroke-width="0.8"/>
<path d="M480 400 l3.2 -3.2 l3.2 3.2 l-3.2 3.2 z" fill="none" stroke="rgba(238,244,255,.4)" stroke-width="0.8"/>
<path d="M700 294 l3.2 -3.2 l3.2 3.2 l-3.2 3.2 z" fill="none" stroke="rgba(238,244,255,.4)" stroke-width="0.8"/>
<g class="tm-path-constellation">
<line class="tm-path-thread" x1="480" y1="360" x2="458" y2="338"/>
<line class="tm-path-thread" x1="458" y1="338" x2="466" y2="312"/>
<line class="tm-path-thread" x1="466" y1="312" x2="452" y2="292"/>
<line class="tm-path-thread" x1="480" y1="430" x2="498" y2="448"/>
<line class="tm-path-thread" x1="498" y1="448" x2="488" y2="470"/>
<line class="tm-path-thread" x1="620" y1="294" x2="632" y2="282"/>
<line class="tm-path-thread" x1="632" y1="282" x2="648" y2="288"/>
<line class="tm-path-thread" x1="760" y1="294" x2="774" y2="306"/>
<circle class="tm-path-star" cx="458" cy="338" r="1.15"/>
<circle class="tm-path-star" cx="466" cy="312" r="1.0"/>
<circle class="tm-path-star" cx="452" cy="292" r="1.15"/>
<circle class="tm-path-star" cx="498" cy="448" r="1.0"/>
<circle class="tm-path-star" cx="488" cy="470" r="1.15"/>
<circle class="tm-path-star" cx="632" cy="282" r="1.0"/>
<circle class="tm-path-star" cx="648" cy="288" r="1.1"/>
<circle class="tm-path-star" cx="774" cy="306" r="1.0"/>
</g>
</svg>
<span class="tm-path-node tm-orb-design" style="left:20%;top:83.333%;color:#3EEFD0">
<svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<circle class="tm-orb-ring" cx="11" cy="11" r="9"/>
<circle cx="11" cy="11" r="7.2" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<circle class="tm-orb-core" cx="11" cy="11" r="4.2"/>
</svg>
</span>
<span class="tm-path-elbow" style="left:48%;top:83.333%">
<svg viewBox="0 0 14 14" fill="none" aria-hidden="true">
<path d="M7 1.6 L12.4 7 L7 12.4 L1.6 7 Z" stroke="rgba(238,244,255,.55)" stroke-width="1"/>
<path d="M7 4.4 L9.6 7 L7 9.6 L4.4 7 Z" fill="rgba(10,16,36,.85)" stroke="rgba(180,215,255,.5)" stroke-width="0.7"/>
</svg>
</span>
<span class="tm-path-junct tm-orb-sheets" style="left:48%;top:49%;color:#4CBCFF">
<svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
<circle cx="20" cy="20" r="18" stroke="rgba(238,244,255,.22)" stroke-width="0.8"/>
<circle cx="20" cy="20" r="13.5" stroke="rgba(180,215,255,.4)" stroke-width="1.05"/>
<circle cx="20" cy="20" r="9.2" stroke="rgba(197,184,255,.32)" stroke-width="0.7" stroke-dasharray="1.6 2.2"/>
<g stroke="rgba(238,244,255,.4)" stroke-width="0.9" stroke-linecap="round">
<line x1="20" y1="2.2" x2="20" y2="6.4"/>
<line x1="20" y1="33.6" x2="20" y2="37.8"/>
<line x1="2.2" y1="20" x2="6.4" y2="20"/>
<line x1="33.6" y1="20" x2="37.8" y2="20"/>
<line x1="7.4" y1="7.4" x2="10.2" y2="10.2"/>
<line x1="29.8" y1="29.8" x2="32.6" y2="32.6"/>
<line x1="32.6" y1="7.4" x2="29.8" y2="10.2"/>
<line x1="10.2" y1="29.8" x2="7.4" y2="32.6"/>
</g>
<path d="M20 15.2 L24.8 20 L20 24.8 L15.2 20 Z" stroke="rgba(238,244,255,.7)" stroke-width="0.9"/>
<circle class="tm-orb-core" cx="20" cy="20" r="2.2"/>
<circle class="tm-orb-ring" cx="20" cy="20" r="4.4"/>
</svg>
</span>
<span class="tm-path-node tm-orb-packs" style="left:92%;top:49%;color:#FFD24A">
<svg viewBox="0 0 22 22" fill="none" aria-hidden="true">
<circle class="tm-orb-ring" cx="11" cy="11" r="9"/>
<circle cx="11" cy="11" r="7.2" stroke="rgba(238,244,255,.22)" stroke-width="0.7"/>
<circle class="tm-orb-core" cx="11" cy="11" r="4.2"/>
</svg>
</span>`;

/** 24×24 tool glyphs (inner SVG markup) used on section chips and the dock. */
export const PATH_TOOL_ICON_MARKUP: Record<AppToolId, string> = {
  iconEditor: `<path d="M12 3.5 L20 8 V16.2 L12 20.5 L4 16.2 V8 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 3.5 V20.5 M4 8 L12 12.4 L20 8" fill="none" stroke="currentColor" stroke-width="1.6"/>`,
  glowMaker: `<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".7"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2" stroke="currentColor" stroke-width="1.5"/>`,
  geodeButtons: `<rect x="3.5" y="8" width="17" height="9" rx="4.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="12.5" r="1.3" fill="currentColor"/><path d="M12 12.5h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>`,
  menuRecolor: `<circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 4.5 A7.5 7.5 0 0 1 19.5 12 H12 Z" fill="currentColor" opacity=".85"/><circle cx="12" cy="12" r="2.2" fill="none" stroke="currentColor" stroke-width="1.5"/>`,
  particleEditor: `<path d="M12 3 L13.2 9.2 L19.5 8 L14.2 12 L19 16.5 L12.8 14 L12 21 L11.2 14 L5 16.5 L9.8 12 L4.5 8 L10.8 9.2 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>`,
  splitter: `<rect x="3.5" y="5" width="17" height="14" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 5v14" stroke="currentColor" stroke-width="1.7" stroke-dasharray="2 2"/><path d="M9 12h6" stroke="currentColor" stroke-width="1.7"/>`,
  merger: `<rect x="3" y="6" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="13" y="6" width="8" height="12" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 12h2" stroke="currentColor" stroke-width="1.7"/>`,
  porter: `<rect x="4" y="5" width="11" height="14" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M15 9h5l-2 3 2 3h-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  upscaler: `<rect x="4" y="10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.6"/><rect x="11" y="4" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 10l7-6" stroke="currentColor" stroke-width="1.5"/>`,
  randomizer: `<path d="M4 7h5l3 3 3-3h5M4 17h5l3-3 3 3h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M16 5l3 2-3 2M16 15l3 2-3 2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>`,
  convertToNewVersion: `<path d="M5 7h8v4H5zM11 13h8v4h-8z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 9h5l-1.5-2M15 9l-1.5 2" stroke="currentColor" stroke-width="1.5" fill="none"/>`,
  texturePackInstaller: `<path d="M5 9.5 L12 6 L19 9.5 V17 L12 20.5 L5 17 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 6v14.5M5 9.5l7 3.5 7-3.5" stroke="currentColor" stroke-width="1.6"/>`,
};

/** Dock Home (house) and Settings (gear) glyphs, 24×24 inner markup. */
export const DOCK_HOME_ICON_MARKUP = `<path d="M4 11.5 L12 5 L20 11.5 V19 A1.5 1.5 0 0 1 18.5 20.5 H5.5 A1.5 1.5 0 0 1 4 19 Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path><path d="M10 20.5v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.6"></path>`;
export const DOCK_SETTINGS_ICON_MARKUP = `<path d="M9.8 3.4h4.4l.55 2.15 2.05-.75 3.1 3.1-.75 2.05 2.15.55v4.4l-2.15.55.75 2.05-3.1 3.1-2.05-.75L14.2 20.6H9.8l-.55-2.15-2.05.75-3.1-3.1.75-2.05L2.7 13.4v-4.4l2.15-.55-.75-2.05 3.1-3.1 2.05.75z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path><circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" stroke-width="1.5"></circle>`;
