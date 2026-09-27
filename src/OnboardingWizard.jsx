import { useEffect, useState } from "react";
import { GUIDE, identityPrompt, stripPromptText } from "./qpetGuide.js";

const STEPS = ["欢迎", "生成角色图", "生成动作条带", "上传并生成", "完成"];

function PromptBox({ title, text }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The textarea below stays selectable for manual copy.
    }
  };
  return (
    <div className="prompt-box">
      <div className="prompt-box-head">
        <span>{title}</span>
        <button type="button" onClick={copy}>{copied ? "已复制 ✓" : "复制提示词"}</button>
      </div>
      <textarea readOnly value={text} rows={4} onFocus={(event) => event.target.select()} />
    </div>
  );
}

export function OnboardingWizard() {
  const [step, setStep] = useState(0);
  const [strips, setStrips] = useState({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { document.title = "小小的她 · 专属形象向导"; }, []);

  useEffect(() => window.pet?.onQPetProgress?.((progress) => {
    if (progress?.message) setMessage(progress.message);
    if (progress?.finished) {
      setBusy(false);
      if (progress.error) return;
      window.pet?.completeOnboarding?.();
      setStep(4);
      window.setTimeout(() => window.pet?.openDashboard?.("home"), 900);
    }
  }), []);

  const copyText = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label}已复制，去生图工具里粘贴即可。`);
    } catch {
      setMessage("复制失败，请手动选中提示词文本复制。");
    }
  };

  const handleStripFile = (name, event) => {
    const file = event.target?.files?.[0];
    event.target.value = "";
    if (!file) return;
    const sourcePath = window.pet?.pathForFile?.(file);
    if (!sourcePath) {
      setMessage("无法读取图片路径，请把图片放在本地磁盘后重试。");
      return;
    }
    setStrips((current) => {
      const previous = current[name];
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      return { ...current, [name]: { sourcePath, previewUrl: URL.createObjectURL(file), fileName: file.name } };
    });
  };

  const clearStrip = (name) => {
    setStrips((current) => {
      const previous = current[name];
      if (previous?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const allReady = GUIDE.strips.every((spec) => strips[spec.name]);

  const startAssembly = async () => {
    if (!allReady || busy) return;
    setBusy(true);
    setMessage("正在本地拼装你的专属桌宠…全程免费，约十几秒到一分钟。");
    const payload = {};
    for (const spec of GUIDE.strips) payload[spec.name] = strips[spec.name].sourcePath;
    const result = await window.pet?.qpetAssemble?.(payload);
    if (!result?.ok) {
      setBusy(false);
      setMessage(result?.error || "生成任务没能启动。");
    }
  };

  const skip = () => {
    window.pet?.completeOnboarding?.();
    window.close();
  };

  return (
    <main className="onboarding">
      <header className="onb-head">
        <img src="./assets/brand/mascot-icon.png" alt="" />
        <div>
          <strong>小小的她 · 专属形象向导</strong>
          <small>全程免费 · 用哪个生图工具由你决定 · 拼装在本机完成，照片不会上传给项目方</small>
        </div>
      </header>

      <ol className="onb-stepper">
        {STEPS.map((label, index) => (
          <li key={label} className={index === step ? "current" : index < step ? "done" : ""}>
            <i>{index < step ? "✓" : index + 1}</i>{label}
          </li>
        ))}
      </ol>

      <section className="onb-body">
        {step === 0 && (
          <div className="onb-step">
            <h1>把这只桌宠，变成你自己的。</h1>
            <p className="onb-lead">跟着向导走三步：用你喜欢的 AI 生图工具生成专属的 Q 版角色和动作，回到这里上传，剩下的抠图、拼装、安装全部自动完成。生成后，桌宠的一举一动都来自你自己的图片。</p>
            <ul className="onb-facts">
              <li>应用本身不调用任何付费接口；生图用哪个工具、要不要花钱，由你决定（很多工具有免费额度）</li>
              <li>约 10 分钟：1 张角色图 + 7 张动作条带</li>
              <li>男生、女生的照片都可以，角色会忠实保留照片人物的气质</li>
            </ul>
            <div className="onb-actions">
              <button type="button" className="onb-primary" onClick={() => setStep(1)}>开始定制</button>
              <button type="button" className="onb-ghost" onClick={skip}>跳过，先用默认形象</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onb-step">
            <h2>第 1 层 · 生成 Q 版角色图</h2>
            <ol className="onb-howto">
              <li>打开任意 AI 生图工具（豆包、即梦、ChatGPT 等），选择"图片生成"，上传一张人物照片（男生女生都可以）。</li>
              <li>粘贴下面的角色化提示词，发送。</li>
              <li>得到一张<b>横向 4 列 × 2 行、共 8 个角色</b>的 Q 版设定图。它是后面所有动作的参考图——先确认满意（是你、够 Q、动作正常），不满意就多生成几次。</li>
            </ol>
            <PromptBox title="角色化提示词（配合你的人物照片使用）" text={identityPrompt()} />
            <div className="onb-actions">
              <button type="button" className="onb-ghost" onClick={() => setStep(0)}>上一步</button>
              <button type="button" className="onb-primary" onClick={() => setStep(2)}>我已生成角色图，下一步</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onb-step">
            <h2>第 2 层 · 生成 7 张动作条带</h2>
            <ol className="onb-howto">
              <li>还是在这个生图工具里，把<b>刚才的 Q 版角色图</b>作为参考图上传。</li>
              <li>逐条复制下面的动作提示词发送，每次得到一张横向动作条带图，共 7 张。</li>
              <li>每张条带里应是{GUIDE.strips.map((spec) => `${spec.label} ${spec.frames} 格`).join("、")}；哪张不满意单独重做即可。</li>
            </ol>
            <div className="guide-strip-prompts">
              {GUIDE.strips.map((spec) => <PromptBox key={spec.name} title={`${spec.label}（横条 ${spec.frames} 格）`} text={stripPromptText(spec)} />)}
            </div>
            <div className="onb-actions">
              <button type="button" className="onb-ghost" onClick={() => setStep(1)}>上一步</button>
              <button type="button" className="onb-primary" onClick={() => setStep(3)}>我已生成动作条带，下一步</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="onb-step">
            <h2>第 3 层 · 上传条带，一键生成</h2>
            <p className="onb-lead">把 7 张动作条带图上传到下面。抠图、按脚底基线对齐、拼装成完整动作图集、质量校验、安装——全部在本机自动完成。</p>
            <div className="guide-upload-list">
              {GUIDE.strips.map((spec) => (
                <div key={spec.name} className="guide-upload-row">
                  <span className="guide-upload-label">{spec.label}<small>{spec.frames} 格横条</small></span>
                  {strips[spec.name]
                    ? <span className="guide-upload-thumb"><img src={strips[spec.name].previewUrl} alt="" /></span>
                    : <span className="guide-upload-thumb empty">空</span>}
                  <label className="lite-pick-label">
                    <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => handleStripFile(spec.name, event)} />
                    {strips[spec.name] ? "重新选择" : "上传图片"}
                  </label>
                  {strips[spec.name] && <button type="button" className="lite-remove" onClick={() => clearStrip(spec.name)} aria-label={`移除${spec.label}`}>×</button>}
                </div>
              ))}
            </div>
            {message && <p className="interaction-feedback" role="status">{message}</p>}
            <div className="onb-actions">
              <button type="button" className="onb-ghost" onClick={() => setStep(2)}>上一步</button>
              <button type="button" className="onb-primary" disabled={busy || !allReady} onClick={startAssembly}>{busy ? "拼装中…" : allReady ? "一键生成我的桌宠" : "上传完 7 张后可用"}</button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="onb-step onb-done">
            <h1>完成！桌宠已经是你自己的了。</h1>
            <p className="onb-lead">陪伴面板正在打开。桌宠的一举一动——待机、奔跑、挥手、失落——现在都来自你生成的图片。</p>
            <ul className="onb-facts">
              <li>想微调？哪张条带不满意，重做后在向导第 3 层重新上传生成即可</li>
              <li>想还原默认形象：陪伴面板 →「徽章装扮」→「我的形象」→ 恢复默认</li>
            </ul>
            <div className="onb-actions">
              <button type="button" className="onb-primary" onClick={() => { window.pet?.openDashboard?.("home"); window.close(); }}>打开陪伴面板</button>
            </div>
          </div>
        )}
      </section>

      {message && step !== 3 && <p className="onb-status" role="status">{message}</p>}
      <footer className="onb-foot">
        <small>提示词模板来自本项目默认角色的真实制作工艺；你的照片与生成图片只保存在这台电脑上。</small>
      </footer>
    </main>
  );
}
