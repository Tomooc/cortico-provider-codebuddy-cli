# cortico-provider-codebuddy-cli

鎶?**CodeBuddy 瀹樻柟 CLI** 鎺ユ垚 Coopanion锛圕ortico 鍐呮牳锛夌殑涓€涓ā鍨嬬鐐广€侰LI 鍙綋銆屾棤鐘舵€併€佸彧浼氭寜 JSON Schema 鍚愮粨鏋勫寲缁撴灉銆嶇殑鎺ㄧ悊鍚庣锛?*宸ュ叿鎵ц鏉?100% 鐣欏湪 Coopanion**銆?
## 鍘熺悊

```
Coopanion 鍙戣捣 Responses 璇锋眰锛坕nstructions + context items + tools锛?  鈫?鏈?provider 鎷?JSON 淇″皝锛坢essages + tools + responseSchema锛屽伐鍏峰悕 enum 纭攣锛?  鈫?spawn codebuddy --print --output-format json --json-schema <schema>
        --tools StructuredOutput --strict-mcp-config --mcp-config {"mcpServers":{}}
        --no-session-persistence --max-turns 4 --system-prompt <MODEL_SYSTEM_PROMPT>
  鈫?鍙 stdout 鐨?structured_output锛堢己澶卞嵆鎶ラ敊锛屼笉鐢ㄨ嚜鐢辨枃鏈《鏇匡級
  鈫?涓ユ牸鏍￠獙 {text, toolCalls}锛堟湭澹版槑宸ュ叿 鈫?CLI_TOOL_CALL_INVALID锛?  鈫?缈绘垚 Cortico 鐨?Response / output items / 娴佷簨浠?/ usage / attempts
  鈫?Coopanion 鑷繁鎵ц宸ュ叿锛屽啀鎶婄粨鏋滀綔涓?function_call_output 鍥炵亴杩涙潵
```

涓?`dsh-dkn-codebuddy-cli` 鍚屾瀯鐨勫嚑鏉＄邯寰嬶細

- CLI 渚у彧鐣?`StructuredOutput` 涓€涓嚭鍙ｏ紝绂?MCP銆佺浼氳瘽钀界洏銆乣max-turns` 闄愭銆?- 宸ュ叿鍚嶅啓杩?schema 鐨?`enum`锛岃秺鐣岃皟鐢ㄥ湪瑙ｆ瀽鏈熷氨琚嫆锛屼笉浼氶潤榛樹涪銆?- 鏁扮粍褰㈠紡鐨?CLI 杈撳嚭蹇呴』鎭板ソ涓€鏉?`type === "result"`锛屽惁鍒?`CLI_RESULT_AMBIGUOUS`銆?- 閿欒鎸夊浐瀹氭鍒欏垎绫伙紙402 / 400 涓婁笅鏂?/ 401 / 403 / 429 / EPERM / 缃戠粶锛夛紝stderr 鍘熸枃涓嶅娉勩€?
## 瀹夎

### 鏂瑰紡涓€锛欳oopanion 鎵╁睍椤碉紙鎺ㄨ崘锛?
> **瀹炴祴闄愬埗**锛氭墿灞曢〉鐨勫畨瑁呮帴鍙ｏ紙`POST /api/extensions/check` / `install`锛夊彧鎺ュ彈**鐩綍璺緞**銆傚～ `.tgz` 浼氳鎷掞細`{"error":"鐩綍涓嶅瓨鍦? ...tgz"}`锛涘～瑙ｅ帇鍚庣殑鐩綍鍒欐甯歌繑鍥?`{"name":...,"version":...,"kind":"provider"}`銆?>
> 鎵€浠ワ細`tar -xzf cortico-provider-codebuddy-cli-0.2.2.tgz` 鍙栧嚭閲岄潰鐨?`package/` 鐩綍鍐嶅～锛屾垨鑰呯洿鎺ュ～婧愮爜鐩綍銆?>
> **瑕佽鍒汉鐪熸涓€閿**锛氭妸鍖呭彂甯冨埌 npm锛坄npm publish`锛屽寘鍚嶅甫 `cortico-provider` 鍏抽敭瀛楀嵆鍙銆屾墿灞曘€嶉〉鐨勫競鍦烘绱㈠懡涓級锛屼箣鍚庡埆浜哄彧闇€鍦ㄥ競鍦洪噷鎼滅储瀹夎锛屼笉纰版湰鍦拌矾寰勩€?
1. 鎶婃湰鐩綍鎵撴垚 tarball锛歚npm pack`锛堟垨鐩存帴鐢ㄧ洰褰曟湰韬級銆?2. 鎵撳紑 Coopanion 鈫?銆屾墿灞曘€嶉〉 鈫?瀹夎 鈫?濉?**鏈湴璺緞**锛坄...\cortico-provider-codebuddy-cli-0.2.2.tgz` 鎴栧寘鐩綍锛夈€?3. 閲嶅惎 Core锛堟墿灞曢〉浼氭彁绀?`restartRequired`锛夈€?4. 銆岃缃?鈫?妯″瀷绔偣銆嶆柊寤虹鐐癸紝妯″潡閫?**CodeBuddy CLI**銆?
### 鏂瑰紡浜岋細涓€琛岃剼鏈?
```powershell
pwsh -File tools/install.ps1
```

```sh
sh tools/install.sh
```

鑴氭湰浼氾細瀹氫綅 Coopanion 鈫?鎶婂寘澶嶅埗鍒?`extensions/vendor/` 涓?`extensions/node_modules/` 鈫?鍦?`extensions/package.json` 閲岀櫥璁?`file:./vendor/cortico-provider-codebuddy-cli` 鈫?璇锋眰 `/api/run/restart`銆?
> **涓嶈**鎶婁緷璧栧啓鎴?`"cortico-provider-codebuddy-cli": "0.1.0"` 杩欑鐗堟湰鍙枫€俙0.1.0` 鏄?registry 璇箟锛宲npm 浼氬幓 npmjs 鎷夊寘锛岃€岃繖涓寘娌℃湁鍙戝竷 鈫?`ERR_PNPM_FETCH_404`锛屽苟涓斾細杩炲甫鎶?*鍚屼竴鐩綍涓嬩换浣?world 鎵╁睍鐨勫畨瑁?*涓€璧锋墦鏂紙pnpm 瑁呮柊鍖呭墠瑕佸厛瑙ｆ瀽璇ョ洰褰曠殑鍏ㄩ儴渚濊禆锛夈€傛湰鍦板寘涓€寰嬬敤 `file:` 璺緞銆?
### 鏂瑰紡涓夛細鎵嬪姩

```
<Coopanion>/data/extensions/
  package.json                      # dependencies 閲屽姞 "cortico-provider-codebuddy-cli": "file:./vendor/cortico-provider-codebuddy-cli"
  vendor/cortico-provider-codebuddy-cli/      # 婧愮爜鍓湰锛坧npm 鐨勫畨瑁呮簮锛?  node_modules/cortico-provider-codebuddy-cli/ # 杩愯鏃跺姞杞界殑鍓湰
```

鏀瑰畬 `POST http://127.0.0.1:17788/api/run/restart`銆?
## 鍓嶇疆鏉′欢

- Coopanion 0.2.x锛堟鏋?`cortico.api = 6`锛夈€?- Node 鈮?22銆?- 瀹樻柟 CodeBuddy CLI 宸插畨瑁呭苟鐧诲綍锛坄codebuddy --version` 鍙敤锛夈€傞粯璁ゆ煡鎵鹃『搴忥細`options.cliPath` 鈫?`%LOCALAPPDATA%\codebuddy\bin` 鈫?`~/.codebuddy/bin` 鈫?`%APPDATA%\npm` 鈫?PATH銆?
## 绔偣閫夐」

绔偣椤电殑銆孋odeBuddy CLI銆嶇粍閲岃兘鐩存帴閫夎繖涓夋牱锛?
| 閿?| 榛樿 | 璇存槑 |
|---|---|---|
| `options.model` | `default`锛堣窡闅?CLI锛?| **涓嬫媺**锛岄€夐」鏉ヨ嚜 CLI 鐨?ACP 妯″瀷鐩綍锛涢€夊叿浣?id 灏变紶 `--model`锛岃处鏈篃璁扮湡瀹炲瀷鍙?|
| `options.effort` | `follow`锛堣窡闅忚姹傦級 | **涓嬫媺**锛歚follow` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max`锛岄€忎紶 `--effort` |
| `options.contextWindow` | 鎺㈡祴鍊?| **鏁存暟**锛?6000鈥?000000 token锛屾墜鍔ㄨ鐩栦笂鎶ョ粰 Cortico 鐨勭獥鍙ｏ紙鍐冲畾涓婁笅鏂囬绠椾笌瑁佸壀锛?|
| `options.cliPath` | 鑷姩 | codebuddy 鍙墽琛屾枃浠惰矾寰?|
| `options.timeoutMs` | 180000 | 鍗曟 CLI 璋冪敤瓒呮椂锛?5000鈥?00000锛?|
| `options.maxTurns` | 4 | 閫忎紶 `--max-turns`锛?鈥?6锛夛紝闃叉 CLI 鑷繁澶氳疆璺?|

鍨嬪彿瑙ｆ瀽椤哄簭锛氳姹傞噷鐨?`model` 鈫?`options.model` 鈫?`spec.model` 鈫?璺熼殢 CLI銆侰oopanion 鍙戣姹傛椂 `request.model` 灏辩瓑浜?`spec.model`锛屾墍浠?`default` 浼氳褰撲綔銆屾湭鎸囧畾銆嶈烦杩団€斺€旇繖鏍?`options.model` 鎵嶆姠寰楀埌銆?
`schema.spec.model` 閲屽～鐨勫瀷鍙峰悓鏍风敓鏁堬紱浼樺厛绾э細璇锋眰閲岀殑 `model` 鈫?`options.model` 鈫?`spec.model` 鈫?璺熼殢 CLI銆?
## 妯″瀷鐩綍

涓嶅啓姝诲瀷鍙枫€俙listModels()` 璧?CLI 鐨?ACP 鎻℃墜锛坄--acp` 鈫?`initialize` 鈫?`session/new`锛夎 `models.availableModels` 涓?`currentModelId`锛?5 鍒嗛挓缂撳瓨銆佸け璐?60 绉掑悗閲嶈瘯銆傛帰娴嬪け璐ユ椂鍙繚鐣欎竴椤?`default`锛堣窡闅?CLI 褰撳墠妯″瀷锛夛紝涓嶈噯閫犲瀷鍙枫€?
鍦ㄤ綔鑰呮満鍣紙CLI 2.178.1锛夊疄娴嬫帰娴嬪埌鐨勫綋鍓嶆ā鍨嬫槸 `hy4-preview`锛屽彲閫?16 椤癸紝鍚?`deepseek-v4.1-flash`銆乣glm-5.3-flash`銆乣kimi-k3.1-pro`銆乣step-5-preview`銆乣mimo-v2.6-pro` 绛夈€?*涓嶆妸浣犻拤鍦ㄨ繖浠借〃涓?*鈥斺€斿畠浼氶殢璐﹀彿涓?CLI 鐗堟湰鍙樸€?
鎯宠璐︽湰璁扮湡瀹炲瀷鍙凤紙鑰屼笉鏄?`default`锛夛紝鎶?`spec.model` 鍐欐垚鍏蜂綋 id 鍗冲彲锛涙鏃?provider 浼氫紶 `--model`銆?
## 甯歌閿欒

| code | 鍚箟 / 澶勭悊 |
|---|---|
| `CLI_NOT_FOUND` | 鎵句笉鍒?codebuddy锛涘～ `options.cliPath` |
| `CLI_TIMEOUT` | 瓒呮椂锛岃繘绋嬫爲宸?`taskkill /T /F` |
| `CLI_OUTPUT_TOO_LARGE` | stdout 瓒?20 MiB |
| `CLI_OUTPUT_EMPTY` / `CLI_OUTPUT_INVALID` | stdout 涓虹┖鎴栦笉鏄?JSON |
| `CLI_RESULT_AMBIGUOUS` | 杈撳嚭閲屾渶缁堢粨鏋滀笉鍞竴 |
| `CLI_STRUCTURED_OUTPUT_MISSING` | 娌″悙 `structured_output` |
| `CLI_STRUCTURED_OUTPUT_INVALID` | `structured_output` 涓嶆槸 `{text, toolCalls}` |
| `CLI_STRUCTURED_OUTPUT_EMPTY` | 绌烘枃鏈笖鏃犲伐鍏疯皟鐢?|
| `CLI_TOOL_CALL_INVALID` | 鏈０鏄庡伐鍏?/ 鍙傛暟涓嶆槸瀵硅薄 |
| `CLI_TOOL_PROTOCOL_ERROR` | 妯″瀷鎶?Cortico 宸ュ叿褰?CLI 鍘熺敓宸ュ叿璋冪敤 |
| `CLI_AUTH_REQUIRED` (401) | CLI 鐧诲綍澶辨晥锛岄噸鏂?`/login` |
| `CLI_INSUFFICIENT_BALANCE` (402) | 瀹樻柟棰濆害涓嶈冻 |
| `CLI_ACCESS_DENIED` (403) / `CLI_RATE_LIMITED` (429) | 鏉冮檺 / 闄愭祦 |
| `CLI_CONTEXT_TOO_LARGE` (400) | 瀵硅瘽瓒呬笂涓嬫枃 |
| `CLI_LOCAL_PERMISSION_DENIED` | 鏈満鏂囦欢鏉冮檺 |
| `CLI_NETWORK_ERROR` | 鍒板畼鏂规湇鍔＄殑杩炴帴涓柇 |

## 寮€鍙戜笌鑷祴

```bash
node tools/selftest.mjs        # 5 缁勭绾跨敤渚嬶紝涓嶉渶瑕?CLI銆佷笉鑱旂綉
node tools/probe-cli.mjs       # 鐪?spawn / 棣栧瓧鑺?/ exit / close 鍥涗釜鏃跺埢
node tools/probe-tools.mjs     # 鐪熷疄淇″皝涓嬮獙璇佹ā鍨嬩細鐢?toolCalls 璇磋瘽
node tools/probe-catalog.mjs   # ACP 鎻℃墜锛屾墦鍗板綋鍓嶆ā鍨嬩笌鍙€夌洰褰?```

`selftest` 瑕嗙洊锛氫俊灏佷笌 schema 纭攣銆佺粨鏋勫寲缁撴灉鏍￠獙锛堟枃鏈?/ 宸ュ叿 / 鏈０鏄庡伐鍏?/ 鍧忓弬鏁?/ 绌哄洖澶嶏級銆佷簨浠舵祦鐘舵€佹満锛堝簭鍙烽€掑銆乣response.created` 棣栥€乣response.completed` 灏俱€乮tem 闂悎涓€鑷淬€乽sage锛夈€佸瓙杩涚▼ stdin鈫抯tdout銆侀敊璇垎绫汇€?
## 鐩綍

```
src/envelope.js      鍗忚淇″皝 + outputSchema + MODEL_SYSTEM_PROMPT
src/cli.js           瀹氫綅 CLI / .cmd shim 鎷嗗寘 / 瀛愯繘绋嬭皟搴?/ 閿欒鍒嗙被 / structured_output 璇诲彇
src/result.js        涓ユ牸鏍￠獙 {text, toolCalls}
src/response.js      Response 搴曠 / usage 鎹㈢畻 / Responses 浜嬩欢娴?src/model-catalog.js ACP 妯″瀷鐩綍鎺㈡祴 + TTL 缂撳瓨
src/index.js         ProviderModule锛堝惈 config 鍒嗙粍銆乿alidateEntry銆乧reate锛?tools/               瀹夎鑴氭湰涓庡洓涓帰閽?鑷祴
```

## 璁稿彲

MIT锛岃 `LICENSE`銆?