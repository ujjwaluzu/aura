; Give Windows shortcuts a dedicated icon resource instead of an executable
; icon cached from a previous build. Preserve targets, arguments and pin choices.
!define MUI_FINISHPAGE_TEXT "Aura has been installed.$\r$\n$\r$\nOn first launch, Aura enables Start Aura with Windows for this Windows user. You can turn it off in Settings > General."

!macro AuraRefreshShortcutIcon shortcut
  Push $0
  Push $1
  Push $2
  Push $3
  Push $4
  Push $5
  Push $R9
  ${If} ${FileExists} "${shortcut}"
    !insertmacro IsShortcutTarget "${shortcut}" "$INSTDIR\${MAINBINARYNAME}.exe"
    Pop $R9
    ${If} $R9 = 1
      !insertmacro ComHlpr_CreateInProcInstance ${CLSID_ShellLink} ${IID_IShellLink} r0 ""
      ${If} $0 P<> 0
        ${IUnknown::QueryInterface} $0 '("${IID_IPersistFile}",.r1)'
        ${If} $1 P<> 0
          ${IPersistFile::Load} $1 '("${shortcut}", ${STGM_READWRITE})'
          ${IShellLink::SetIconLocation} $0 '(w "$INSTDIR\Aura.ico", i 0)'
          ${IPersistFile::Save} $1 '("${shortcut}",1)'
          ${IUnknown::Release} $1 ""
        ${EndIf}
        ${IUnknown::Release} $0 ""
      ${EndIf}
      !insertmacro SetLnkAppUserModelId "${shortcut}"
      System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x1005, w "${shortcut}", p 0)'
    ${EndIf}
  ${EndIf}
  Pop $R9
  Pop $5
  Pop $4
  Pop $3
  Pop $2
  Pop $1
  Pop $0
!macroend

!macro AuraRefreshPinnedIcons folder
  Push $R6
  Push $R7
  FindFirst $R6 $R7 "${folder}\*.lnk"
  ${DoWhile} $R7 != ""
    !insertmacro AuraRefreshShortcutIcon "${folder}\$R7"
    FindNext $R6 $R7
  ${Loop}
  FindClose $R6
  Pop $R7
  Pop $R6
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ${If} ${FileExists} "$INSTDIR\Aura.ico"
    !if "${STARTMENUFOLDER}" != ""
      !insertmacro AuraRefreshShortcutIcon "$SMPROGRAMS\$AppStartMenuFolder\${PRODUCTNAME}.lnk"
    !else
      !insertmacro AuraRefreshShortcutIcon "$SMPROGRAMS\${PRODUCTNAME}.lnk"
    !endif
    !insertmacro AuraRefreshShortcutIcon "$DESKTOP\${PRODUCTNAME}.lnk"
    !insertmacro AuraRefreshPinnedIcons "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"
    !insertmacro AuraRefreshPinnedIcons "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\StartMenu"
    System::Call 'shell32::SHChangeNotify(i 0x2000, i 0x1005, w "$INSTDIR\Aura.ico", p 0)'
  ${EndIf}
!macroend
