/* Native focus order plus modal isolation for keyboard and TalkBack navigation.
 * Never disables an OS screen reader. Works with the existing dialog open/close handlers. */
(function(){
  'use strict';
  let modal=null,opener=null,lastOutside=null,restores=[];
  const visible=e=>{for(let n=e;n&&n!==document;n=n.parentElement){if(n.hidden||n.classList.contains('hidden')||n.getAttribute('aria-hidden')==='true'||getComputedStyle(n).display==='none')return false;}return true;};
  const focusables=e=>[...e.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(x=>!x.disabled&&x.tabIndex>=0&&visible(x));
  const focus=e=>{try{e?.focus({preventScroll:true});}catch{e?.focus();}};
  function release(){for(const [e,inert,hidden] of restores){e.inert=inert;if(hidden===null)e.removeAttribute('aria-hidden');else e.setAttribute('aria-hidden',hidden);}restores=[];}
  function sync(){
    if(typeof document==='undefined'||!document?.body)return;
    // Restore our own isolation before discovering the next open dialog.
    release();
    const dialogs=[...document.querySelectorAll('[role="dialog"][aria-modal="true"]')].filter(visible);
    const next=dialogs.at(-1)||null;
    if(next!==modal){
      const previous=modal;modal=next;
      if(next){opener=previous?opener:(next.contains(document.activeElement)?lastOutside:document.activeElement);}
      else if(previous){const target=opener;opener=null;if(target?.isConnected&&visible(target))focus(target);}
    }
    if(!modal)return;
    for(let n=modal;n&&n.parentElement&&n!==document.body;n=n.parentElement){
      for(const sibling of n.parentElement.children){if(sibling.inert||sibling.getAttribute('aria-hidden')==='true'||sibling===n||['SCRIPT','STYLE','LINK'].includes(sibling.tagName))continue;restores.push([sibling,sibling.inert,sibling.getAttribute('aria-hidden')]);sibling.inert=true;sibling.setAttribute('aria-hidden','true');}
    }
    if(!modal.contains(document.activeElement)){if(!modal.hasAttribute('tabindex'))modal.tabIndex=-1;focus(focusables(modal)[0]||modal);}
  }
  document.addEventListener('focusin',e=>{if(!modal)lastOutside=e.target;else if(!modal.contains(e.target))focus(focusables(modal)[0]||modal);});
  document.addEventListener('keydown',e=>{
    if(!modal)return;
    if(e.key==='Tab'){
      const list=focusables(modal),first=list[0]||modal,last=list.at(-1)||modal;
      if(e.shiftKey&&(document.activeElement===first||!list.includes(document.activeElement))){e.preventDefault();focus(last);}
      else if(!e.shiftKey&&(document.activeElement===last||!list.includes(document.activeElement))){e.preventDefault();focus(first);}
    }else if(e.key==='Escape'){
      const cancel=modal.querySelector('[data-dialog-cancel],#modal-close,#btn-cancel-chat-notice,#black-search-cancel,#confirm-dialog-no,.close-btn');
      if(cancel){e.preventDefault();cancel.click();}
    }
  });
  // Observe only visibility-related changes, not the inert/ARIA changes we make.
  new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['class','hidden','style'],childList:true});
  sync();
})();
