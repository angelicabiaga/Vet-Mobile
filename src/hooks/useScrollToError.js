import { useCallback, useRef } from 'react';

const TOP_GAP = 16; // keep the field's label in view above it

// Scroll a ScrollView so `node` sits near the top. Native: measure the node
// against the ScrollView's content. Web (and anything that can't measure):
// let the browser bring it into view.
function scrollToNode(scrollView, node) {
  if (!node) return;
  const go = (y) => scrollView?.scrollTo?.({ y: Math.max(y - TOP_GAP, 0), animated: true });
  const fallback = () => node.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  const content = scrollView?.getInnerViewRef?.() || scrollView?.getInnerViewNode?.();
  if (content && typeof node.measureLayout === 'function') {
    try {
      node.measureLayout(content, (_x, y) => go(y), fallback);
      return;
    } catch {
      // fall through
    }
  }
  fallback();
}

// After a failed save, scroll back to the first field outlined in red.
//
//   const errorScroll = useScrollToError(scrollRef);
//   <View ref={errorScroll.anchor('email')}> ...field... </View>
//   errorScroll.scrollToFirstError(errors, ['name', 'email', 'phone']);
//
// `order` is the fields' top-to-bottom order on screen; without it the
// errors object's own key order is used.
export default function useScrollToError(scrollRef) {
  const anchors = useRef({});

  const anchor = useCallback((name) => (node) => {
    if (node) anchors.current[name] = node;
    else delete anchors.current[name];
  }, []);

  const scrollToFirstError = useCallback((errors, order) => {
    const names = order || Object.keys(errors || {});
    const first = names.find((name) => errors?.[name] && anchors.current[name]);
    if (!first) return;
    // Next frame, so the red messages have rendered and the layout is final.
    requestAnimationFrame(() => scrollToNode(scrollRef?.current, anchors.current[first]));
  }, [scrollRef]);

  return { anchor, scrollToFirstError };
}
