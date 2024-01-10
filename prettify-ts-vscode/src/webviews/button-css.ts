export const buttonCss = /* html */ `
<style>
  .button-container {
    display: grid;
    grid-template-columns: 1fr minmax(auto, 300px) 1fr;
    transition: grid-template-columns 0.3s ease-in-out;
  }

  button.vscode-button {
    color: var(--vscode-button-foreground);
    background-color: var(--vscode-button-background);
    border: none;
    padding: 6px 10px;
    text-align: center;
    text-decoration: none;
    display: block;
    font-size: 1em;
    margin: 10px 0px;
    max-width: 300px;
    cursor: pointer;
    width: 100%;
    box-sizing: border-box;
    border-radius: 2px;
    grid-column: 2;
  }

  @media (min-width: 500px) {
    .button-container {
      grid-template-columns: 0fr minmax(auto, 300px) 1fr;
    }
  }

  button.vscode-button:hover {
    background-color: var(--vscode-button-hoverBackground);
  }
</style>
`
