import '@src/Popup.css';
import { withErrorBoundary, withSuspense } from '@extension/shared';

const Popup = () => {
  return (
    <div className="p-3">
      <p> Use this extension in the side panel. (Right click the extension logo and Click `Open Side Panel` </p>
    </div>
  );
};

export default withErrorBoundary(withSuspense(Popup, <div> Loading ... </div>), <div> Error Occur </div>);
